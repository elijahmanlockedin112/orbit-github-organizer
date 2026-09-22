// Shared app state plus the filter/sort pipeline.
import { metaFor, getSettings } from './store.js';
import { daysSince } from './util.js';

export const state = {
  profile: null,      // GitHub user object
  repos: [],          // enriched repo objects
  loaded: false,
  error: null,
  query: '',
  view: 'grid',
  filters: { status: '', lang: '', tag: '' },
  sort: 'updated',
  pagesOnly: false,
  includeForks: false,
  includeArchived: false,
};

export function syncFromSettings() {
  const s = getSettings();
  state.view = s.view || 'grid';
  state.sort = s.sort || 'updated';
  state.pagesOnly = !!s.pagesOnly;
  state.includeForks = !!s.includeForks;
  state.includeArchived = !!s.includeArchived;
}

/** Text a search query is matched against. */
function haystack(repo) {
  const m = metaFor(repo.full_name);
  return [
    repo.name, repo.description, repo.language,
    ...(repo.topics || []),
    ...Object.keys(repo.langBytes || {}),
    ...(m.tags || []),
    m.notes, m.status,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function visibleRepos() {
  const q = state.query.trim().toLowerCase();
  const terms = q ? q.split(/\s+/) : [];

  let list = state.repos.filter((r) => {
    const m = metaFor(r.full_name);
    if (m.hidden) return false;
    if (!state.includeForks && r.fork) return false;
    if (!state.includeArchived && r.archived) return false;
    if (state.pagesOnly && !r.hasPages) return false;
    if (state.filters.status && m.status !== state.filters.status) return false;
    if (state.filters.lang && r.language !== state.filters.lang) return false;
    if (state.filters.tag && !(m.tags || []).includes(state.filters.tag)) return false;
    if (terms.length) {
      const hay = haystack(r);
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });

  const cmp = {
    updated: (a, b) => new Date(b.pushed_at || b.updated_at) - new Date(a.pushed_at || a.updated_at),
    created: (a, b) => new Date(b.created_at) - new Date(a.created_at),
    loc:     (a, b) => (b.loc?.total || 0) - (a.loc?.total || 0),
    stars:   (a, b) => b.stargazers_count - a.stargazers_count || (b.loc?.total || 0) - (a.loc?.total || 0),
    name:    (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    stale:   (a, b) => daysSince(b.pushed_at) - daysSince(a.pushed_at),
  }[state.sort] || (() => 0);

  list.sort(cmp);

  // Pinned repos always float to their own section, in the same order.
  const pinned = list.filter((r) => metaFor(r.full_name).pinned);
  const rest = list.filter((r) => !metaFor(r.full_name).pinned);
  return { pinned, rest, all: list };
}

export function portfolioStats() {
  const active = state.repos.filter((r) => {
    const m = metaFor(r.full_name);
    return !m.hidden && (state.includeForks || !r.fork) && (state.includeArchived || !r.archived);
  });
  return {
    repos: active.length,
    lines: active.reduce((n, r) => n + (r.loc?.total || 0), 0),
    codeLines: active.reduce((n, r) => n + (r.loc?.code || 0), 0),
    stars: active.reduce((n, r) => n + r.stargazers_count, 0),
    forks: active.reduce((n, r) => n + r.forks_count, 0),
    pages: active.filter((r) => r.hasPages).length,
    languages: new Set(active.flatMap((r) => Object.keys(r.langBytes || {}))).size,
    pushedThisMonth: active.filter((r) => daysSince(r.pushed_at) <= 30).length,
    stale: active.filter((r) => daysSince(r.pushed_at) > 180).length,
    private: active.filter((r) => r.private).length,
    list: active,
  };
}

export const repoByName = (fullName) => state.repos.find((r) => r.full_name === fullName);
