/* ==========================================================================
   WORKFLOW ZERO IT — MSP DATA STORE (LOCAL + CLOUDFLARE EDGE KV + FIRESTORE)
   ========================================================================== */

const WZ_STORAGE_KEY = 'workflow_zero_psa_v5_clean';
const WZ_TIMESTAMP_KEY = 'workflow_zero_psa_v5_epoch';

const DEFAULT_PSA_DATA = {
  clients: [],
  tickets: [],
  timeEntries: [],
  kbArticles: []
};

// In-memory tracking of the last saved state hash to prevent sync loops
let lastKnownStateHash = '';
let isSyncInProgress = false;

function computeStateHash(data) {
  try {
    if (!data) return '';
    const clientsSig = (data.clients || []).map(c => `${c.id}:${c.name}:${c.mrr}:${c.contactEmail}`).join('|');
    const ticketsSig = (data.tickets || []).map(t => `${t.id}:${t.status}:${t.updatedEpoch || t.updatedAt}`).join('|');
    const timeSig = (data.timeEntries || []).length;
    const kbSig = (data.kbArticles || []).length;
    return `${clientsSig}__${ticketsSig}__${timeSig}__${kbSig}`;
  } catch (e) {
    return String(Date.now());
  }
}

// ---------------------------------------------------------------------------
// Synchronous Local Load
// ---------------------------------------------------------------------------
function loadPsaState() {
  try {
    const raw = localStorage.getItem(WZ_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(WZ_STORAGE_KEY, JSON.stringify(DEFAULT_PSA_DATA));
      return JSON.parse(JSON.stringify(DEFAULT_PSA_DATA));
    }
    const parsed = JSON.parse(raw);
    const state = {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : [],
      kbArticles: Array.isArray(parsed.kbArticles) ? parsed.kbArticles : []
    };
    lastKnownStateHash = computeStateHash(state);
    return state;
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_PSA_DATA));
  }
}

// ---------------------------------------------------------------------------
// Save State (Local Storage + Cloudflare Edge KV + Firestore)
// ---------------------------------------------------------------------------
function savePsaState(state) {
  try {
    const cleanState = {
      clients: Array.isArray(state.clients) ? JSON.parse(JSON.stringify(state.clients)) : [],
      tickets: Array.isArray(state.tickets) ? JSON.parse(JSON.stringify(state.tickets)) : [],
      timeEntries: Array.isArray(state.timeEntries) ? JSON.parse(JSON.stringify(state.timeEntries)) : [],
      kbArticles: Array.isArray(state.kbArticles) ? JSON.parse(JSON.stringify(state.kbArticles)) : []
    };

    const now = Date.now();
    lastKnownStateHash = computeStateHash(cleanState);

    // 1. Instant local persistence
    localStorage.setItem(WZ_STORAGE_KEY, JSON.stringify(cleanState));
    localStorage.setItem(WZ_TIMESTAMP_KEY, String(now));

    // 2. Cloudflare Edge KV API persistence
    fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleanState)
    }).catch(err => {
      // Non-blocking network catch
      console.warn('Edge KV sync notice:', err.message);
    });

    // 3. Google Cloud Firestore persistence
    if (window.FirebaseService && typeof window.FirebaseService.isCloudReady === 'function' && window.FirebaseService.isCloudReady()) {
      window.FirebaseService.syncStateToCloud(cleanState).catch(err => {
        console.warn('Firestore sync notice:', err.message);
      });
    }
  } catch (e) {
    console.error('Failed to save PSA state:', e);
  }
}

// ---------------------------------------------------------------------------
// Load State from Cloud (Dual Engine: Edge KV + Firestore)
// ---------------------------------------------------------------------------
async function loadCloudState() {
  let remoteState = null;

  // 1. Try Cloudflare Edge KV first (<20ms edge latency)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('/api/state', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && (Array.isArray(data.clients) || Array.isArray(data.tickets) || Array.isArray(data.timeEntries) || Array.isArray(data.kbArticles))) {
        if ((data.clients && data.clients.length > 0) || (data.tickets && data.tickets.length > 0) || (data.timeEntries && data.timeEntries.length > 0) || (data.kbArticles && data.kbArticles.length > 0)) {
          remoteState = {
            clients: Array.isArray(data.clients) ? data.clients : [],
            tickets: Array.isArray(data.tickets) ? data.tickets : [],
            timeEntries: Array.isArray(data.timeEntries) ? data.timeEntries : [],
            kbArticles: Array.isArray(data.kbArticles) ? data.kbArticles : []
          };
        }
      }
    }
  } catch (kvErr) {
    // Edge KV not reachable or timed out
  }

  // 2. Try Firestore if Edge KV didn't return populated state or to verify
  if (!remoteState && window.FirebaseService && typeof window.FirebaseService.loadStateFromCloud === 'function') {
    try {
      const fsData = await window.FirebaseService.loadStateFromCloud();
      if (fsData && (Array.isArray(fsData.clients) || Array.isArray(fsData.tickets))) {
        if ((fsData.clients && fsData.clients.length > 0) || (fsData.tickets && fsData.tickets.length > 0)) {
          remoteState = {
            clients: Array.isArray(fsData.clients) ? fsData.clients : [],
            tickets: Array.isArray(fsData.tickets) ? fsData.tickets : [],
            timeEntries: Array.isArray(fsData.timeEntries) ? fsData.timeEntries : [],
            kbArticles: Array.isArray(fsData.kbArticles) ? fsData.kbArticles : []
          };
        }
      }
    } catch (fsErr) {
      // Firestore load notice
    }
  }

  return remoteState;
}

// ---------------------------------------------------------------------------
// Real-time Cloud Synchronization Manager
// ---------------------------------------------------------------------------
function startCloudSync(onUpdateCallback) {
  if (typeof onUpdateCallback !== 'function') return;

  function handleRemoteUpdate(incomingState) {
    if (!incomingState || typeof incomingState !== 'object') return;

    const newHash = computeStateHash(incomingState);
    if (newHash === lastKnownStateHash) {
      return; // No meaningful change, skip unnecessary DOM re-renders
    }

    lastKnownStateHash = newHash;
    const sanitized = {
      clients: Array.isArray(incomingState.clients) ? incomingState.clients : [],
      tickets: Array.isArray(incomingState.tickets) ? incomingState.tickets : [],
      timeEntries: Array.isArray(incomingState.timeEntries) ? incomingState.timeEntries : [],
      kbArticles: Array.isArray(incomingState.kbArticles) ? incomingState.kbArticles : []
    };

    // Update local cache
    try {
      localStorage.setItem(WZ_STORAGE_KEY, JSON.stringify(sanitized));
      localStorage.setItem(WZ_TIMESTAMP_KEY, String(Date.now()));
    } catch (e) {}

    onUpdateCallback(sanitized);
  }

  // 1. Initial async hydration from cloud
  loadCloudState().then(cloudData => {
    if (cloudData) {
      handleRemoteUpdate(cloudData);
    }
  }).catch(() => {});

  // 2. Real-time push listener from Firestore
  if (window.FirebaseService && typeof window.FirebaseService.subscribeToCloudState === 'function') {
    window.FirebaseService.subscribeToCloudState(cloudData => {
      if (cloudData) {
        handleRemoteUpdate(cloudData);
      }
    });
  }

  // 3. Tab visibility / device wake re-sync (crucial for mobile phones)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      loadCloudState().then(cloudData => {
        if (cloudData) handleRemoteUpdate(cloudData);
      }).catch(() => {});
    }
  });

  window.addEventListener('focus', () => {
    loadCloudState().then(cloudData => {
      if (cloudData) handleRemoteUpdate(cloudData);
    }).catch(() => {});
  });

  // 4. Background heartbeat poll (every 25 seconds)
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadCloudState().then(cloudData => {
        if (cloudData) handleRemoteUpdate(cloudData);
      }).catch(() => {});
    }
  }, 25000);
}
