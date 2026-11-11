/* ==========================================================================
   WORKFLOW ZERO IT — FIREBASE CLOUD DATABASE & AUTHENTICATION SERVICE
   ========================================================================== */

(function () {
  'use strict';

  const STORAGE_KEY_CONFIG = 'wz_firebase_config_v1';
  const STORAGE_KEY_AUTH_USER = 'wz_local_auth_user_v1';

  // Default empty placeholder config
  const DEFAULT_CONFIG = {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  };

  let firebaseApp = null;
  let authInstance = null;
  let firestoreInstance = null;
  let activeCloudUnsubscribe = null;
  let authListeners = [];
  let syncListeners = [];
  let currentAuthUser = null;

  // -------------------------------------------------------------------------
  // Helper: Parse Firebase Config from text or JSON
  // -------------------------------------------------------------------------
  function parseConfigString(input) {
    if (!input || typeof input !== 'string') return null;
    const clean = input.trim();
    if (!clean) return null;

    // Try direct JSON
    try {
      const parsed = JSON.parse(clean);
      if (parsed && typeof parsed === 'object') return sanitizeConfig(parsed);
    } catch (e) {}

    // Try extracting object {...}
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        // Replace unquoted keys (e.g. apiKey: "...") with quoted keys ("apiKey": "...")
        const jsonReady = match[0]
          .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
          .replace(/'/g, '"')
          .replace(/,(\s*[}\]])/g, '$1');
        const parsed = JSON.parse(jsonReady);
        return sanitizeConfig(parsed);
      } catch (e) {}
    }

    // Key-value extraction fallback
    const config = {};
    const keys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    keys.forEach(k => {
      const reg = new RegExp(`['"]?${k}['"]?\\s*[:=]\\s*['"]([^'"]+)['"]`, 'i');
      const m = clean.match(reg);
      if (m && m[1]) config[k] = m[1].trim();
    });

    return sanitizeConfig(config);
  }

  function sanitizeConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    return {
      apiKey: String(cfg.apiKey || '').trim(),
      authDomain: String(cfg.authDomain || '').trim(),
      projectId: String(cfg.projectId || '').trim(),
      storageBucket: String(cfg.storageBucket || '').trim(),
      messagingSenderId: String(cfg.messagingSenderId || '').trim(),
      appId: String(cfg.appId || '').trim()
    };
  }

  // -------------------------------------------------------------------------
  // Load and Save Config
  // -------------------------------------------------------------------------
  function loadConfig() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        return sanitizeConfig(parsed);
      }
    } catch (e) {
      console.warn('Failed to load Firebase config from storage:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(cfg) {
    const clean = sanitizeConfig(cfg);
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(clean));
    } catch (e) {
      console.error('Failed to save Firebase config:', e);
    }
    return initFirebase(clean);
  }

  function clearConfig() {
    localStorage.removeItem(STORAGE_KEY_CONFIG);
    if (activeCloudUnsubscribe) {
      activeCloudUnsubscribe();
      activeCloudUnsubscribe = null;
    }
    firebaseApp = null;
    authInstance = null;
    firestoreInstance = null;
  }

  // -------------------------------------------------------------------------
  // Initialize Firebase (Compat SDK)
  // -------------------------------------------------------------------------
  function initFirebase(cfg) {
    const config = cfg || loadConfig();

    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK not found on window. Running in offline/local mode.');
      return false;
    }

    if (!config.apiKey || !config.projectId) {
      return false;
    }

    try {
      // Re-use existing app or initialize new
      if (firebase.apps && firebase.apps.length > 0) {
        firebaseApp = firebase.apps[0];
      } else {
        firebaseApp = firebase.initializeApp(config);
      }

      authInstance = firebase.auth();
      firestoreInstance = firebase.firestore();

      // Listen to Firebase Auth state
      authInstance.onAuthStateChanged(user => {
        if (user) {
          currentAuthUser = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email.split('@')[0],
            isFirebase: true
          };
          localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(currentAuthUser));
        } else {
          currentAuthUser = null;
          localStorage.removeItem(STORAGE_KEY_AUTH_USER);
        }
        notifyAuthListeners(currentAuthUser);
      });

      return true;
    } catch (err) {
      console.error('Firebase initialization error:', err);
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Auth Listeners & State
  // -------------------------------------------------------------------------
  function notifyAuthListeners(user) {
    authListeners.forEach(fn => {
      try { fn(user); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  function onAuthStateChanged(fn) {
    if (typeof fn === 'function') {
      authListeners.push(fn);
      // Immediately notify of current state
      fn(getCurrentUser());
    }
    return () => {
      authListeners = authListeners.filter(f => f !== fn);
    };
  }

  function getCurrentUser() {
    if (currentAuthUser) return currentAuthUser;
    try {
      const stored = localStorage.getItem(STORAGE_KEY_AUTH_USER);
      if (stored) {
        currentAuthUser = JSON.parse(stored);
        return currentAuthUser;
      }
    } catch (e) {}
    return null;
  }

  // -------------------------------------------------------------------------
  // Authentication Actions (Sign In, Sign Up, Sign Out)
  // -------------------------------------------------------------------------
  async function signIn(email, password) {
    if (!email || !password) {
      throw new Error('Please enter both an email address and password.');
    }

    // 1. If Firebase Auth is initialized and configured
    if (authInstance && isConfigured()) {
      const cred = await authInstance.signInWithEmailAndPassword(email.trim(), password);
      const user = cred.user;
      currentAuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        isFirebase: true
      };
      localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(currentAuthUser));
      notifyAuthListeners(currentAuthUser);
      return currentAuthUser;
    }

    // 2. Local / Offline Mode Sign-In
    const displayName = email.split('@')[0].replace(/[._-]/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
    currentAuthUser = {
      uid: 'local-' + Date.now(),
      email: email.trim(),
      displayName: displayName || 'Technician',
      isFirebase: false
    };
    localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(currentAuthUser));
    notifyAuthListeners(currentAuthUser);
    return currentAuthUser;
  }

  async function signUp(email, password, displayName) {
    if (!email || !password) {
      throw new Error('Please enter both an email address and password.');
    }

    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
    }

    // 1. Firebase Auth Sign Up
    if (authInstance && isConfigured()) {
      const cred = await authInstance.createUserWithEmailAndPassword(email.trim(), password);
      const user = cred.user;
      const name = displayName?.trim() || email.split('@')[0];
      try {
        await user.updateProfile({ displayName: name });
      } catch (e) {}

      currentAuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: name,
        isFirebase: true
      };
      localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(currentAuthUser));
      notifyAuthListeners(currentAuthUser);
      return currentAuthUser;
    }

    // 2. Local / Offline Mode Sign-Up
    const name = displayName?.trim() || email.split('@')[0];
    currentAuthUser = {
      uid: 'local-' + Date.now(),
      email: email.trim(),
      displayName: name,
      isFirebase: false
    };
    localStorage.setItem(STORAGE_KEY_AUTH_USER, JSON.stringify(currentAuthUser));
    notifyAuthListeners(currentAuthUser);
    return currentAuthUser;
  }

  async function signOut() {
    if (activeCloudUnsubscribe) {
      activeCloudUnsubscribe();
      activeCloudUnsubscribe = null;
    }

    if (authInstance && isConfigured()) {
      try {
        await authInstance.signOut();
      } catch (e) {
        console.warn('Firebase signOut warning:', e);
      }
    }

    currentAuthUser = null;
    localStorage.removeItem(STORAGE_KEY_AUTH_USER);
    notifyAuthListeners(null);
  }

  // -------------------------------------------------------------------------
  // Cloud Database (Firestore) Operations
  // -------------------------------------------------------------------------
  function isConfigured() {
    const cfg = loadConfig();
    return Boolean(cfg.apiKey && cfg.projectId);
  }

  function isCloudReady() {
    return Boolean(firestoreInstance && isConfigured() && currentAuthUser);
  }

  async function syncStateToCloud(state) {
    if (!isCloudReady()) return false;

    try {
      const docRef = firestoreInstance.collection('psa_workspaces').doc('default_msp');
      const cleanPayload = {
        clients: state.clients || [],
        tickets: state.tickets || [],
        timeEntries: state.timeEntries || [],
        kbArticles: state.kbArticles || [],
        lastUpdatedBy: currentAuthUser?.email || 'technician',
        lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      await docRef.set(cleanPayload, { merge: true });

      // Also sync individual documents for queryability
      const batch = firestoreInstance.batch();

      (state.clients || []).forEach(c => {
        const ref = firestoreInstance.collection('clients').doc(c.id);
        batch.set(ref, c, { merge: true });
      });

      (state.tickets || []).forEach(t => {
        const ref = firestoreInstance.collection('tickets').doc(t.id);
        batch.set(ref, t, { merge: true });
      });

      (state.timeEntries || []).forEach(te => {
        const ref = firestoreInstance.collection('timeEntries').doc(te.id);
        batch.set(ref, te, { merge: true });
      });

      (state.kbArticles || []).forEach(kb => {
        const ref = firestoreInstance.collection('kbArticles').doc(kb.id);
        batch.set(ref, kb, { merge: true });
      });

      await batch.commit();
      return true;
    } catch (err) {
      console.error('Error syncing state to Firestore:', err);
      throw err;
    }
  }

  async function loadStateFromCloud() {
    if (!isCloudReady()) return null;

    try {
      const docRef = firestoreInstance.collection('psa_workspaces').doc('default_msp');
      const snap = await docRef.get();

      if (snap.exists) {
        const data = snap.data();
        return {
          clients: Array.isArray(data.clients) ? data.clients : [],
          tickets: Array.isArray(data.tickets) ? data.tickets : [],
          timeEntries: Array.isArray(data.timeEntries) ? data.timeEntries : [],
          kbArticles: Array.isArray(data.kbArticles) ? data.kbArticles : []
        };
      }

      // If main document doesn't exist yet, query individual collections
      const [cSnap, tSnap, teSnap, kbSnap] = await Promise.all([
        firestoreInstance.collection('clients').get(),
        firestoreInstance.collection('tickets').get(),
        firestoreInstance.collection('timeEntries').get(),
        firestoreInstance.collection('kbArticles').get()
      ]);

      return {
        clients: cSnap.docs.map(d => d.data()),
        tickets: tSnap.docs.map(d => d.data()),
        timeEntries: teSnap.docs.map(d => d.data()),
        kbArticles: kbSnap.docs.map(d => d.data())
      };
    } catch (err) {
      console.error('Error loading state from Firestore:', err);
      return null;
    }
  }

  function subscribeToCloudState(onUpdate) {
    if (!isCloudReady()) return () => {};

    if (activeCloudUnsubscribe) {
      activeCloudUnsubscribe();
      activeCloudUnsubscribe = null;
    }

    try {
      const docRef = firestoreInstance.collection('psa_workspaces').doc('default_msp');
      activeCloudUnsubscribe = docRef.onSnapshot(
        doc => {
          if (doc.exists) {
            const data = doc.data();
            const cloudState = {
              clients: Array.isArray(data.clients) ? data.clients : [],
              tickets: Array.isArray(data.tickets) ? data.tickets : [],
              timeEntries: Array.isArray(data.timeEntries) ? data.timeEntries : [],
              kbArticles: Array.isArray(data.kbArticles) ? data.kbArticles : []
            };
            if (typeof onUpdate === 'function') {
              onUpdate(cloudState);
            }
          }
        },
        err => {
          console.warn('Firestore real-time subscription warning:', err);
        }
      );
      return activeCloudUnsubscribe;
    } catch (err) {
      console.warn('Failed to subscribe to Firestore:', err);
      return () => {};
    }
  }

  // -------------------------------------------------------------------------
  // Public Service Interface
  // -------------------------------------------------------------------------
  window.FirebaseService = {
    init: initFirebase,
    isConfigured,
    isCloudReady,
    loadConfig,
    saveConfig,
    clearConfig,
    parseConfigString,
    signIn,
    signUp,
    signOut,
    getCurrentUser,
    onAuthStateChanged,
    syncStateToCloud,
    loadStateFromCloud,
    subscribeToCloudState
  };

  // Auto initialize on script load
  initFirebase();
})();
