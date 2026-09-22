// GitHub REST client with ETag-aware caching and rate-limit tracking.
import { cache } from './store.js';

const API = 'https://api.github.com';
const MINUTE = 60_000, HOUR = 3_600_000, DAY = 24 * HOUR;

export class GitHubError extends Error {
  constructor(message, { status = 0, kind = 'http', reset = 0 } = {}) {
    super(message);
    this.status = status;
    this.kind = kind;       // 'auth' | 'ratelimit' | 'notfound' | 'network' | 'http'
    this.reset = reset;
  }
}

export class GitHub {
  constructor(token = '') {
    this.token = token;
    this.rate = { limit: token ? 5000 : 60, remaining: null, reset: 0 };
    this.inflight = new Map();
    this.onRate = null; // set by the UI to keep the rate chip live
  }

  setToken(token) {
    this.token = token;
    this.rate = { limit: token ? 5000 : 60, remaining: null, reset: 0 };
  }

  #headers(extra = {}) {
    const hdrs = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    if (this.token) hdrs.Authorization = `Bearer ${this.token}`;
    return hdrs;
  }

  #readRate(res) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    const reset = res.headers.get('x-ratelimit-reset');
    if (remaining != null) this.rate.remaining = Number(remaining);
    if (limit != null) this.rate.limit = Number(limit);
    if (reset != null) this.rate.reset = Number(reset) * 1000;
    if (remaining != null) this.onRate?.(this.rate);
  }

  /**
   * Fetch a JSON endpoint.
   * @param {string} path      API path beginning with "/"
   * @param {object} opts      { cacheKey, ttl, immutable, accept, allow404, force }
   */
  async get(path, opts = {}) {
    const key = opts.cacheKey ?? path;
    const dedupeKey = key + (opts.accept || '');
    if (this.inflight.has(dedupeKey)) return this.inflight.get(dedupeKey);

    const task = this.#doGet(path, key, opts).finally(() => this.inflight.delete(dedupeKey));
    this.inflight.set(dedupeKey, task);
    return task;
  }

  async #doGet(path, key, opts) {
    const cached = opts.force ? null : await cache.get(key);
    // Content-addressed responses (blobs, trees at a sha) never change.
    if (cached && opts.immutable) return cached.data;
    if (cached && cached.exp && cached.exp > Date.now() && !opts.revalidate) return cached.data;

    const headers = this.#headers(opts.accept ? { Accept: opts.accept } : {});
    if (cached?.etag) headers['If-None-Match'] = cached.etag;

    let res;
    try {
      res = await fetch(API + path, { headers, cache: 'no-store' });
    } catch (err) {
      if (cached) return cached.data; // offline: fall back to whatever we have
      throw new GitHubError('Could not reach api.github.com — check your connection.', { kind: 'network' });
    }
    this.#readRate(res);

    if (res.status === 304 && cached) {
      await cache.set(key, { etag: cached.etag, data: cached.data, ttl: opts.ttl ?? HOUR });
      return cached.data;
    }
    if (res.status === 401) {
      throw new GitHubError('GitHub rejected the token. It may be expired or mistyped.', { status: 401, kind: 'auth' });
    }
    if (res.status === 403 || res.status === 429) {
      if (this.rate.remaining === 0) {
        throw new GitHubError('GitHub API rate limit reached.', { status: res.status, kind: 'ratelimit', reset: this.rate.reset });
      }
      if (opts.allow404) return null;
      throw new GitHubError('GitHub refused that request (403). The token may lack the needed scope.', { status: 403, kind: 'auth' });
    }
    if (res.status === 404) {
      if (opts.allow404) return null;
      throw new GitHubError('Not found on GitHub.', { status: 404, kind: 'notfound' });
    }
    if (res.status === 202) return null; // statistics still being computed
    if (!res.ok) {
      throw new GitHubError(`GitHub returned ${res.status}.`, { status: res.status });
    }

    const data = opts.accept && !opts.accept.includes('json') ? await res.text() : await res.json();
    if (!opts.noStore) {
      await cache.set(key, {
        etag: res.headers.get('etag'),
        data,
        ttl: opts.immutable ? 0 : (opts.ttl ?? HOUR),
      });
    }
    return data;
  }

  /* ── Endpoints ─────────────────────────────────────────────────── */

  user(login) {
    return this.get(`/users/${login}`, { cacheKey: `user:${login}`, ttl: 6 * HOUR, revalidate: true });
  }

  authedUser() {
    return this.get('/user', { cacheKey: 'user:me', ttl: 6 * HOUR, allow404: true });
  }

  /** All repos owned by `login`, paginated. Uses /user/repos when the token owns them. */
  async repos(login, { isSelf = false, onPage, revalidate = true, force = false } = {}) {
    const out = [];
    const per = 100;
    for (let page = 1; page <= 10; page++) {
      const path = isSelf
        ? `/user/repos?per_page=${per}&page=${page}&affiliation=owner&sort=updated`
        : `/users/${login}/repos?per_page=${per}&page=${page}&type=owner&sort=updated`;
      const batch = await this.get(path, {
        cacheKey: `repos:${login}:${isSelf ? 'self' : 'pub'}:${page}`,
        ttl: 10 * MINUTE,
        revalidate,
        force,
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      out.push(...batch);
      if (onPage) onPage(out.length);
      if (batch.length < per) break;
    }
    return out;
  }

  /** Byte counts per language. Keyed on pushed_at so it self-invalidates on a push. */
  languages(repo) {
    return this.get(`/repos/${repo.full_name}/languages`, {
      cacheKey: `lang:${repo.full_name}@${repo.pushed_at}`,
      ttl: 30 * DAY,
      allow404: true,
    });
  }

  async readme(repo) {
    const data = await this.get(`/repos/${repo.full_name}/readme`, {
      cacheKey: `readme:${repo.full_name}@${repo.pushed_at}`,
      ttl: 30 * DAY,
      allow404: true,
    });
    return data || null;
  }

  tree(repo) {
    const ref = repo.default_branch || 'HEAD';
    return this.get(`/repos/${repo.full_name}/git/trees/${ref}?recursive=1`, {
      cacheKey: `tree:${repo.full_name}@${repo.pushed_at}`,
      ttl: 30 * DAY,
      allow404: true,
    });
  }

  /**
   * Blobs are content-addressed, so they can be cached forever — but the
   * extension only gets 10 MB of storage, so skip the cache for bulk reads
   * (the exact line count) and for anything large.
   */
  blob(repo, sha, { noStore = false, size = 0 } = {}) {
    return this.get(`/repos/${repo.full_name}/git/blobs/${sha}`, {
      cacheKey: `blob:${sha}`,
      immutable: true,
      allow404: true,
      noStore: noStore || size > 128_000,
    });
  }

  /** Pages metadata. Needs push access; falls back to null for repos you don't own. */
  pages(repo) {
    return this.get(`/repos/${repo.full_name}/pages`, {
      cacheKey: `pages:${repo.full_name}`,
      ttl: 12 * HOUR,
      allow404: true,
    });
  }

  commitActivity(repo) {
    return this.get(`/repos/${repo.full_name}/stats/commit_activity`, {
      cacheKey: `activity:${repo.full_name}@${repo.pushed_at}`,
      ttl: 7 * DAY,
      allow404: true,
    });
  }

  contributors(repo) {
    return this.get(`/repos/${repo.full_name}/contributors?per_page=12&anon=0`, {
      cacheKey: `contrib:${repo.full_name}@${repo.pushed_at}`,
      ttl: 7 * DAY,
      allow404: true,
    });
  }

  commits(repo, n = 10) {
    return this.get(`/repos/${repo.full_name}/commits?per_page=${n}`, {
      cacheKey: `commits:${repo.full_name}@${repo.pushed_at}`,
      ttl: 7 * DAY,
      allow404: true,
    });
  }

  releases(repo) {
    return this.get(`/repos/${repo.full_name}/releases?per_page=5`, {
      cacheKey: `rel:${repo.full_name}@${repo.pushed_at}`,
      ttl: 7 * DAY,
      allow404: true,
    });
  }

  async rateLimit() {
    try {
      const res = await fetch(`${API}/rate_limit`, { headers: this.#headers(), cache: 'no-store' });
      this.#readRate(res);
      return this.rate;
    } catch { return this.rate; }
  }
}

/** Best-effort Pages URL without calling the API. */
export function guessPagesUrl(repo) {
  if (repo.homepage && /github\.io|pages\.github\.com/.test(repo.homepage)) return repo.homepage;
  const [owner, name] = repo.full_name.split('/');
  const userSite = `${owner.toLowerCase()}.github.io`;
  return name.toLowerCase() === userSite ? `https://${userSite}/` : `https://${userSite}/${name}/`;
}
