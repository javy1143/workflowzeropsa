/* ==========================================================================
   WORKFLOW ZERO IT — MSP DATA STORE (CLEAN ZERO SAMPLE DATA, LOCAL + CLOUD)
   ========================================================================== */

const WZ_STORAGE_KEY = 'workflow_zero_psa_v5_clean';

// 100% Clean initial state — All sample data removed as requested
const DEFAULT_PSA_DATA = {
  clients: [],
  tickets: [],
  timeEntries: [],
  kbArticles: []
};

function loadPsaState() {
  try {
    const raw = localStorage.getItem(WZ_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(WZ_STORAGE_KEY, JSON.stringify(DEFAULT_PSA_DATA));
      return JSON.parse(JSON.stringify(DEFAULT_PSA_DATA));
    }
    const parsed = JSON.parse(raw);
    return {
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
      timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : [],
      kbArticles: Array.isArray(parsed.kbArticles) ? parsed.kbArticles : []
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_PSA_DATA));
  }
}

function savePsaState(state) {
  try {
    const cleanState = {
      clients: Array.isArray(state.clients) ? state.clients : [],
      tickets: Array.isArray(state.tickets) ? state.tickets : [],
      timeEntries: Array.isArray(state.timeEntries) ? state.timeEntries : [],
      kbArticles: Array.isArray(state.kbArticles) ? state.kbArticles : []
    };
    localStorage.setItem(WZ_STORAGE_KEY, JSON.stringify(cleanState));

    // If Firebase Cloud Database is initialized, sync state to Firestore
    if (window.FirebaseService && typeof window.FirebaseService.isCloudReady === 'function' && window.FirebaseService.isCloudReady()) {
      window.FirebaseService.syncStateToCloud(cleanState).catch(err => {
        console.warn('Background cloud sync warning:', err);
      });
    }
  } catch (e) {
    console.error('Failed to save PSA state:', e);
  }
}
