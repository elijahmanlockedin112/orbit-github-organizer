// Small DOM + formatting helpers. No dependencies.

/** Create an element. Props: className, text, html, attrs, dataset, on:{event:fn}, style. */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style') Object.assign(node.style, v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k in node && k !== 'list') node[k] = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 1234 -> "1.2k", 1234567 -> "1.2M" */
export function compact(n) {
  if (n == null || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1e6) return trimZero(n / 1e3) + 'k';
  if (abs < 1e9) return trimZero(n / 1e6) + 'M';
  return trimZero(n / 1e9) + 'B';
}
const trimZero = (v) => (v < 10 ? v.toFixed(1).replace(/\.0$/, '') : String(Math.round(v)));

export const withCommas = (n) => (n == null ? '—' : Number(n).toLocaleString());

export function bytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b < 10 && i > 0 ? b.toFixed(1) : Math.round(b)} ${u[i]}`;
}

const RELATIVE = [
  [31536000, 'year'], [2592000, 'month'], [604800, 'week'],
  [86400, 'day'], [3600, 'hour'], [60, 'minute'],
];
export function relTime(iso) {
  if (!iso) return '—';
  const secs = (Date.now() - new Date(iso).getTime()) / 1000;
  if (secs < 60) return 'just now';
  for (const [span, unit] of RELATIVE) {
    if (secs >= span) {
      const v = Math.floor(secs / span);
      return `${v} ${unit}${v > 1 ? 's' : ''} ago`;
    }
  }
  return 'just now';
}

export const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : Infinity);

export const fullDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Deterministic pleasant colour for an arbitrary string (used for user tags). */
export function hashHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}
export const tagColor = (name) => `hsl(${hashHue(name)} 62% 62%)`;

/** Run async `worker` over `items` with a bounded number of concurrent tasks. */
export async function pool(items, limit, worker, onTick) {
  const queue = [...items.entries()];
  const results = new Array(items.length);
  let done = 0;
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const [i, item] = queue.shift();
      try { results[i] = await worker(item, i); }
      catch (err) { results[i] = { error: err }; }
      if (onTick) onTick(++done, items.length);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Decode GitHub's base64 blob payload (which contains newlines) as UTF-8. */
export function decodeBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  const arr = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(arr);
}

/** Highlight `query` inside plain text, returning safe HTML. */
export function markMatch(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return safe;
  return escapeHtml(text.slice(0, idx)) +
    '<mark>' + escapeHtml(text.slice(idx, idx + query.length)) + '</mark>' +
    escapeHtml(text.slice(idx + query.length));
}

export function toast(message, kind = 'info') {
  let host = $('#toasts');
  if (!host) {
    host = h('div', { id: 'toasts', style: {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '90', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center',
    } });
    document.body.append(host);
  }
  const t = h('div', { class: 'banner' + (kind === 'error' ? ' banner--error' : ''), text: message,
    style: { margin: '0', boxShadow: 'var(--shadow-2)', background: 'var(--bg-elev-2)' } });
  if (kind === 'info') t.style.color = 'var(--text)';
  host.append(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; }, 2600);
  setTimeout(() => t.remove(), 3000);
}
