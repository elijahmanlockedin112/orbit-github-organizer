// Persistence layer: settings, per-repo user metadata, and an HTTP cache.
// Uses chrome.storage.local inside the extension, localStorage when the page
// is opened directly from disk (handy for development).

const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

const backend = hasChrome
  ? {
      get: (keys) => chrome.storage.local.get(keys),
      set: (obj) => chrome.storage.local.set(obj),
      remove: (keys) => chrome.storage.local.remove(keys),
      keys: async () => Object.keys(await chrome.storage.local.get(null)),
      clear: () => chrome.storage.local.clear(),
    }
  : {
      get: async (keys) => {
        const out = {};
        const list = keys == null ? Object.keys(localStorage)
          : Array.isArray(keys) ? keys : Object.keys(keys);
        for (const k of list) {
          const raw = localStorage.getItem(k);
          if (raw != null) { try { out[k] = JSON.parse(raw); } catch { /* skip */ } }
        }
        return out;
      },
      set: async (obj) => {
        for (const [k, v] of Object.entries(obj)) localStorage.setItem(k, JSON.stringify(v));
      },
      remove: async (keys) => {
        for (const k of [].concat(keys)) localStorage.removeItem(k);
      },
      keys: async () => Object.keys(localStorage),
      clear: async () => localStorage.clear(),
    };

export const isExtension = hasChrome;

/* ── Settings ─────────────────────────────────────────────────────── */

export const DEFAULT_SETTINGS = {
  user: '',
  token: '',
  theme: 'dark',
  view: 'grid',
  sort: 'updated',
  includeForks: false,
  includeArchived: false,
  pagesOnly: false,
  autoRefreshMins: 60,
  livePreviews: true,
  lastSync: 0,
};

let settings = { ...DEFAULT_SETTINGS };

export async function initSettings() {
  const { settings: saved } = await backend.get(['settings']);
  settings = { ...DEFAULT_SETTINGS, ...(saved || {}) };
  return settings;
}
export const getSettings = () => settings;
export async function saveSettings(patch) {
  settings = { ...settings, ...patch };
  await backend.set({ settings });
  return settings;
}

/* ── Per-repo metadata (pins, status, tags, notes) ────────────────── */

export const STATUSES = [
  { id: '',         label: 'No status' },
  { id: 'idea',     label: 'Idea' },
  { id: 'active',   label: 'Active' },
  { id: 'paused',   label: 'Paused' },
  { id: 'shipped',  label: 'Shipped' },
  { id: 'archived', label: 'Shelved' },
];

const BLANK_META = { pinned: false, status: '', tags: [], notes: '', hidden: false, exactLoc: null };
let meta = {};

export async function initMeta() {
  const { meta: saved } = await backend.get(['meta']);
  meta = saved || {};
  return meta;
}
export const metaFor = (fullName) => ({ ...BLANK_META, ...(meta[fullName] || {}) });
export const allMeta = () => meta;

export async function saveMeta(fullName, patch) {
  meta[fullName] = { ...metaFor(fullName), ...patch };
  // Drop entries that carry no information so the store stays small.
  const m = meta[fullName];
  if (!m.pinned && !m.status && !m.tags.length && !m.notes && !m.hidden && m.exactLoc == null) {
    delete meta[fullName];
  }
  await backend.set({ meta });
  return metaFor(fullName);
}

export function allTags() {
  const counts = new Map();
  for (const m of Object.values(meta)) {
    for (const t of m.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/* ── HTTP / data cache ────────────────────────────────────────────── */

const CACHE_PREFIX = 'c:';

export const cache = {
  async get(key) {
    const k = CACHE_PREFIX + key;
    const got = await backend.get([k]);
    const entry = got[k];
    if (!entry) return null;
    if (entry.exp && entry.exp < Date.now()) { await backend.remove(k); return null; }
    return entry;
  },
  async set(key, { etag, data, ttl }) {
    const k = CACHE_PREFIX + key;
    const entry = { etag, data, exp: ttl ? Date.now() + ttl : 0, at: Date.now() };
    try {
      await backend.set({ [k]: entry });
    } catch (err) {
      // Most likely the 10 MB quota. Drop the cache and keep going uncached.
      console.warn('[orbit] cache write failed, purging cache', err);
      await cache.purge();
      try { await backend.set({ [k]: entry }); } catch { /* give up silently */ }
    }
    return entry;
  },
  async purge() {
    const keys = (await backend.keys()).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length) await backend.remove(keys);
    return keys.length;
  },
  async size() {
    if (hasChrome && chrome.storage.local.getBytesInUse) {
      return chrome.storage.local.getBytesInUse(null);
    }
    return Object.entries(localStorage).reduce((n, [k, v]) => n + k.length + v.length, 0);
  },
};

/* ── Export / import ──────────────────────────────────────────────── */

export async function exportData() {
  const { settings: s, meta: m } = await backend.get(['settings', 'meta']);
  const safe = { ...(s || {}) };
  delete safe.token; // never put the token in a file the user might share
  return { orbit: 1, exportedAt: new Date().toISOString(), settings: safe, meta: m || {} };
}

export async function importData(payload) {
  if (!payload || payload.orbit !== 1) throw new Error('Not an Orbit backup file.');
  const merged = { ...meta, ...(payload.meta || {}) };
  meta = merged;
  await backend.set({ meta: merged });
  if (payload.settings) {
    await saveSettings({ ...payload.settings, token: settings.token });
  }
  return Object.keys(merged).length;
}

export async function wipeEverything() {
  await backend.clear();
  settings = { ...DEFAULT_SETTINGS };
  meta = {};
}
