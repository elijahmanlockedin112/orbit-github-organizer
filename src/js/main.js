// Orbit — bootstrap and wiring.
import { h, clear, compact, pool, debounce, toast } from './util.js';
import { initSettings as loadSettings, getSettings, saveSettings, initMeta, allTags, metaFor, STATUSES } from './store.js';
import { GitHub, GitHubError, guessPagesUrl } from './github.js';
import { estimateLines } from './loc.js';
import { state, syncFromSettings, visibleRepos, repoByName } from './state.js';
import { renderStatStrip, renderGrid, renderLive, renderLanguages } from './views/dashboard.js';
import { initDetail, openDetail, closeDetail, isDetailOpen } from './views/detail.js';
import { initSettings as initSettingsView, openSettings, closeSettings, isSettingsOpen } from './views/settings.js';

const els = {};
let gh = null;
let refreshing = false;

/** Build an API client wired to keep the rate-limit chip current. */
function makeClient(token) {
  const client = new GitHub(token);
  client.onRate = paintRate;
  return client;
}

/* ── Boot ─────────────────────────────────────────────────────────── */

async function boot() {
  for (const id of ['app', 'setup', 'splash', 'splashMsg', 'detail', 'settings', 'main', 'statstrip',
    'search', 'avatar', 'displayName', 'handle', 'rateLimit', 'refreshBtn', 'themeBtn', 'settingsBtn',
    'viewTabs', 'statusFilter', 'langFilter', 'tagFilter', 'sortBy', 'fPages', 'fForks', 'fArchived',
    'clearFilters', 'footerCount', 'liveCount', 'setupUser', 'setupToken', 'setupGo', 'setupError']) {
    els[id] = document.getElementById(id);
  }

  const settings = await loadSettings();
  await initMeta();
  applyTheme(settings.theme);
  syncFromSettings();

  initDetail(els.detail, { get gh() { return gh; }, onChange: onDataChanged });
  initSettingsView(els.settings, { onChange: onDataChanged, onReconnect: reconnect });
  wireChrome();

  if (!settings.user) { showSetup(); return; }
  gh = makeClient(settings.token);
  await load();
}

function showSetup(message) {
  els.splash.classList.add('is-hiding');
  setTimeout(() => { els.splash.hidden = true; }, 400);
  els.setup.hidden = false;
  els.app.hidden = true;
  if (message) { els.setupError.hidden = false; els.setupError.textContent = message; }
  els.setupUser.focus();
}

async function reconnect() {
  const s = getSettings();
  gh = makeClient(s.token);
  state.repos = [];
  state.loaded = false;
  els.splash.classList.remove('is-hiding');
  els.splash.hidden = false;
  await load();
}

/* ── Data loading ─────────────────────────────────────────────────── */

async function load() {
  const s = getSettings();
  const fresh = s.autoRefreshMins > 0 && Date.now() - (s.lastSync || 0) < s.autoRefreshMins * 60_000;
  const revalidate = !fresh;

  try {
    setSplash('Finding ' + s.user + '…');
    let profile = null;
    let isSelf = false;

    if (s.token) {
      const me = await gh.authedUser();
      if (me && me.login.toLowerCase() === s.user.toLowerCase()) { profile = me; isSelf = true; }
    }
    if (!profile) profile = await gh.user(s.user);
    state.profile = profile;
    paintProfile(profile);

    setSplash('Loading repositories…');
    const repos = await gh.repos(profile.login, { isSelf, revalidate, onPage: (n) => setSplash(`Loading repositories… ${n}`) });

    state.repos = repos.map((r) => ({ ...r, langBytes: null, loc: estimateLines({}), hasPages: !!r.has_pages, pagesUrl: guessPagesUrl(r) }));
    state.loaded = true;
    state.error = null;
    revealApp();
    render();

    await enrich(revalidate);
    await saveSettings({ lastSync: Date.now() });
    render();
    paintRate();
  } catch (err) {
    handleLoadError(err);
  }
}

/** Fetch language bytes for every repo, and real Pages URLs for the ones that publish. */
async function enrich(revalidate) {
  const repos = state.repos;
  if (!repos.length) return;

  let hitLimit = false;
  const repaint = debounce(() => { renderStatStrip(els.statstrip); paintFooter(); if (state.view !== 'live') render(); }, 400);

  await pool(repos, 8, async (repo) => {
    if (hitLimit) return;
    try {
      const langs = await gh.languages(repo);
      repo.langBytes = langs || {};
      repo.loc = estimateLines(repo.langBytes);
      if (!repo.language) repo.language = repo.loc.byLang[0]?.name || null;
    } catch (err) {
      if (err instanceof GitHubError && err.kind === 'ratelimit') { hitLimit = true; return; }
    }
    repaint();
  }, (done, total) => setSplash(`Measuring code… ${done}/${total}`));

  // Accurate Pages URLs (handles custom domains) — only for repos that publish.
  const pagesRepos = repos.filter((r) => r.hasPages);
  if (pagesRepos.length && !hitLimit) {
    await pool(pagesRepos, 5, async (repo) => {
      try {
        const info = await gh.pages(repo);
        if (info?.html_url) repo.pagesUrl = info.html_url;
      } catch { /* /pages needs push access; the guessed URL is fine */ }
    });
  }

  if (hitLimit) {
    showBanner(getSettings().token
      ? 'Hit the GitHub rate limit mid-scan. Some line counts are missing — refresh in an hour.'
      : 'Hit the 60 requests/hour limit for anonymous access, so some line counts are missing. Add a token in Settings for 5,000/hour.',
      'warn');
  }
}

function handleLoadError(err) {
  console.error('[orbit]', err);
  const s = getSettings();
  if (err instanceof GitHubError && err.kind === 'notfound') {
    showSetup(`No GitHub account called "${s.user}". Check the spelling.`);
    return;
  }
  if (err instanceof GitHubError && err.kind === 'auth') {
    showSetup(err.message);
    return;
  }
  if (state.repos.length) {
    revealApp();
    showBanner(err.message || 'Could not refresh from GitHub. Showing cached data.', 'warn');
    render();
    return;
  }
  els.splash.classList.add('is-hiding');
  els.app.hidden = false;
  clear(els.main);
  els.main.append(h('div', { class: 'empty' },
    h('h3', { text: 'Could not load your repositories' }),
    h('p', { text: err.message || String(err) }),
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
      h('button', { class: 'btn btn--primary', text: 'Try again', on: { click: () => location.reload() } }),
      h('button', { class: 'btn', text: 'Settings', on: { click: openSettings } }))));
}

const setSplash = (msg) => { if (els.splashMsg) els.splashMsg.textContent = msg; };

function revealApp() {
  els.setup.hidden = true;
  els.app.hidden = false;
  els.splash.classList.add('is-hiding');
  setTimeout(() => { els.splash.hidden = true; }, 400);
  if (location.hash.length > 1) {
    const repo = repoByName(decodeURIComponent(location.hash.slice(1)));
    if (repo) openDetail(repo);
  }
}

function paintProfile(p) {
  els.avatar.src = p.avatar_url;
  els.avatar.alt = `${p.login} avatar`;
  els.displayName.textContent = p.name || p.login;
  els.handle.textContent = '@' + p.login;
  document.title = `${p.login} · Orbit`;
}

function paintRate(rate) {
  // `rate` is passed by the client callback, which can fire before `gh` is assigned.
  const r = rate || gh?.rate;
  if (!r || r.remaining == null) { els.rateLimit.textContent = ''; return; }
  els.rateLimit.textContent = `${r.remaining}/${r.limit} API`;
  els.rateLimit.classList.toggle('is-low', r.remaining < r.limit * 0.2);
  els.rateLimit.classList.toggle('is-out', r.remaining === 0);
  els.rateLimit.title = r.reset
    ? `Resets ${new Date(r.reset).toLocaleTimeString()}${getSettings().token ? '' : ' · add a token for 5,000/hour'}`
    : 'GitHub API requests left this hour';
}

/* ── Rendering ────────────────────────────────────────────────────── */

function render() {
  if (!state.loaded) return;
  renderStatStrip(els.statstrip);
  paintFilters();
  paintFooter();

  const handlers = {
    onOpen: (repo) => { history.replaceState(null, '', '#' + repo.full_name); openDetail(repo); },
    onTogglePin: async (repo) => {
      const { saveMeta } = await import('./store.js');
      await saveMeta(repo.full_name, { pinned: !metaFor(repo.full_name).pinned });
      render();
    },
    onClearFilters: clearFilters,
    onPickLanguage: (lang) => {
      state.filters.lang = lang;
      state.view = 'grid';
      saveSettings({ view: 'grid' });
      paintViewTabs();
      render();
    },
  };

  if (state.view === 'live') renderLive(els.main, handlers);
  else if (state.view === 'languages') renderLanguages(els.main, handlers);
  else renderGrid(els.main, handlers);
}

function onDataChanged() { render(); }

function paintFooter() {
  const { all } = visibleRepos();
  const lines = all.reduce((n, r) => n + (r.loc?.total || 0), 0);
  els.footerCount.textContent = `${all.length} of ${state.repos.length} projects · ${compact(lines)} lines shown`;
  els.liveCount.textContent = String(state.repos.filter((r) => r.hasPages).length);
}

/** Rebuild the filter dropdowns, preserving the current selection. */
function paintFilters() {
  const langs = [...new Set(state.repos.map((r) => r.language).filter(Boolean))].sort();
  fillSelect(els.langFilter, langs.map((l) => [l, l]), state.filters.lang, 'All languages');

  const tags = allTags();
  fillSelect(els.tagFilter, tags.map(([t, n]) => [t, `${t} (${n})`]), state.filters.tag, 'All collections');

  const used = new Set(Object.values(state.repos).map((r) => metaFor(r.full_name).status).filter(Boolean));
  fillSelect(els.statusFilter, STATUSES.filter((s) => s.id && used.has(s.id)).map((s) => [s.id, s.label]),
    state.filters.status, 'All statuses');

  els.tagFilter.hidden = tags.length === 0;
  els.statusFilter.hidden = used.size === 0;
}

function fillSelect(sel, options, value, allLabel) {
  const prev = value;
  clear(sel);
  sel.append(h('option', { value: '', text: allLabel }));
  for (const [v, label] of options) sel.append(h('option', { value: v, text: label }));
  sel.value = options.some(([v]) => v === prev) ? prev : '';
}

function clearFilters() {
  state.query = '';
  state.filters = { status: '', lang: '', tag: '' };
  state.pagesOnly = false;
  els.search.value = '';
  els.fPages.checked = false;
  saveSettings({ pagesOnly: false });
  render();
}

function paintViewTabs() {
  for (const b of els.viewTabs.children) b.classList.toggle('is-active', b.dataset.view === state.view);
}

function showBanner(text, kind = 'warn') {
  const existing = els.main.previousElementSibling;
  if (existing?.classList.contains('banner')) existing.remove();
  const banner = h('div', { class: 'banner' + (kind === 'error' ? ' banner--error' : '') },
    h('span', { text }),
    h('button', { class: 'btn btn--sm btn--ghost banner__x', text: 'Dismiss', on: { click: () => banner.remove() } }));
  els.main.before(banner);
}

/* ── Chrome / events ──────────────────────────────────────────────── */

function wireChrome() {
  els.search.addEventListener('input', debounce(() => { state.query = els.search.value; render(); }, 140));
  els.search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { els.search.value = ''; state.query = ''; render(); els.search.blur(); } });

  els.viewTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    saveSettings({ view: state.view });
    paintViewTabs();
    render();
  });

  els.statusFilter.addEventListener('change', () => { state.filters.status = els.statusFilter.value; render(); });
  els.langFilter.addEventListener('change', () => { state.filters.lang = els.langFilter.value; render(); });
  els.tagFilter.addEventListener('change', () => { state.filters.tag = els.tagFilter.value; render(); });
  els.sortBy.addEventListener('change', () => { state.sort = els.sortBy.value; saveSettings({ sort: state.sort }); render(); });
  els.fPages.addEventListener('change', () => { state.pagesOnly = els.fPages.checked; saveSettings({ pagesOnly: state.pagesOnly }); render(); });
  els.fForks.addEventListener('change', () => { state.includeForks = els.fForks.checked; saveSettings({ includeForks: state.includeForks }); render(); });
  els.fArchived.addEventListener('change', () => { state.includeArchived = els.fArchived.checked; saveSettings({ includeArchived: state.includeArchived }); render(); });
  els.clearFilters.addEventListener('click', clearFilters);

  els.refreshBtn.addEventListener('click', refresh);
  els.themeBtn.addEventListener('click', toggleTheme);
  els.settingsBtn.addEventListener('click', openSettings);

  els.setupGo.addEventListener('click', doSetup);
  els.setupUser.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetup(); });
  els.setupToken.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSetup(); });

  document.addEventListener('keydown', onKey);

  // Reflect saved filter state into the controls.
  const s = getSettings();
  els.sortBy.value = s.sort || 'updated';
  els.fPages.checked = !!s.pagesOnly;
  els.fForks.checked = !!s.includeForks;
  els.fArchived.checked = !!s.includeArchived;
  paintViewTabs();
}

function onKey(e) {
  if (e.key === 'Escape') {
    if (isSettingsOpen()) return closeSettings();
    if (isDetailOpen()) return closeDetail();
    return;
  }
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (isDetailOpen() || isSettingsOpen()) return;

  if (e.key === '/') { e.preventDefault(); els.search.focus(); els.search.select(); return; }

  // Type-to-search. Bare letters used to trigger refresh/theme/view shortcuts, so
  // typing anywhere outside the input flipped the theme instead of searching.
  // Anything printable now jumps into the search box and the character lands there.
  // Space is left alone so it still scrolls the page.
  if (e.key.length === 1 && e.key !== ' ') els.search.focus();
}

async function refresh() {
  if (refreshing) return;
  refreshing = true;
  els.refreshBtn.classList.add('is-spinning');
  try {
    await saveSettings({ lastSync: 0 });
    const s = getSettings();
    const isSelf = !!s.token && state.profile?.login?.toLowerCase() === s.user.toLowerCase();
    // revalidate (not force) so unchanged pages come back as a free 304.
    const repos = await gh.repos(state.profile.login, { isSelf, revalidate: true });
    const previous = new Map(state.repos.map((r) => [r.full_name, r]));
    state.repos = repos.map((r) => {
      const old = previous.get(r.full_name);
      const keepLangs = old && old.pushed_at === r.pushed_at ? old.langBytes : null;
      return {
        ...r,
        langBytes: keepLangs,
        loc: estimateLines(keepLangs || {}),
        hasPages: !!r.has_pages,
        pagesUrl: old?.pagesUrl && old.has_pages === r.has_pages ? old.pagesUrl : guessPagesUrl(r),
      };
    });
    render();
    await enrich(true);
    await saveSettings({ lastSync: Date.now() });
    render();
    paintRate();
    toast('Up to date');
  } catch (err) {
    showBanner(err.message || 'Refresh failed.', 'error');
  } finally {
    refreshing = false;
    els.refreshBtn.classList.remove('is-spinning');
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}
function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  saveSettings({ theme: next });
}

async function doSetup() {
  const user = els.setupUser.value.trim().replace(/^@/, '').replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  const token = els.setupToken.value.trim();
  if (!user) { els.setupError.hidden = false; els.setupError.textContent = 'Enter a GitHub username.'; return; }

  els.setupGo.disabled = true;
  els.setupGo.textContent = 'Connecting…';
  els.setupError.hidden = true;

  const probe = makeClient(token);
  try {
    await probe.user(user);
  } catch (err) {
    els.setupGo.disabled = false;
    els.setupGo.textContent = 'Connect';
    els.setupError.hidden = false;
    els.setupError.textContent = err instanceof GitHubError && err.kind === 'notfound'
      ? `No GitHub account called "${user}".` : err.message;
    return;
  }

  await saveSettings({ user, token });
  els.setup.hidden = true;
  els.splash.hidden = false;
  els.splash.classList.remove('is-hiding');
  els.setupGo.disabled = false;
  els.setupGo.textContent = 'Connect';
  gh = probe;
  await load();
}

boot();
