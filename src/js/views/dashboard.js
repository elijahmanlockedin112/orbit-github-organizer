// The three dashboard views: project grid, live-sites gallery, language breakdown.
import { h, clear, compact, withCommas, relTime, markMatch, daysSince, tagColor } from '../util.js';
import { icon, iconSvg } from '../icons.js';
import { metaFor, STATUSES } from '../store.js';
import { state, visibleRepos, portfolioStats } from '../state.js';
import { aggregateLanguages, langColor } from '../loc.js';

const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || '';

/* ── Stat strip ───────────────────────────────────────────────────── */

export function renderStatStrip(host) {
  const s = portfolioStats();
  clear(host);
  const tiles = [
    { label: 'Projects', value: withCommas(s.repos), sub: `${s.pushedThisMonth} touched this month` },
    { label: 'Lines of code', value: compact(s.lines), sub: `${compact(s.codeLines)} excluding docs · est.` },
    { label: 'Languages', value: s.languages, sub: topLangSummary() },
    { label: 'Stars', value: compact(s.stars), sub: `${compact(s.forks)} forks` },
    { label: 'Live sites', value: s.pages, sub: s.pages ? 'GitHub Pages' : 'none published' },
    { label: 'Needs love', value: s.stale, sub: 'untouched 6+ months' },
  ];
  for (const t of tiles) {
    host.append(h('div', { class: 'stile' },
      h('div', { class: 'stile__label', text: t.label }),
      h('div', { class: 'stile__value', text: String(t.value) }),
      h('div', { class: 'stile__sub', text: t.sub }),
    ));
  }
}

function topLangSummary() {
  const agg = aggregateLanguages(state.repos);
  return agg.byLang.slice(0, 2).map((l) => l.name).join(', ') || '—';
}

/* ── Project grid ─────────────────────────────────────────────────── */

export function renderGrid(host, handlers) {
  const { pinned, rest } = visibleRepos();
  clear(host);

  if (!pinned.length && !rest.length) {
    host.append(emptyState(handlers));
    return;
  }

  if (pinned.length) {
    host.append(h('div', { class: 'section-head' }, icon('pin'), 'Pinned'));
    host.append(h('div', { class: 'grid' }, pinned.map((r) => card(r, handlers))));
  }
  if (rest.length) {
    if (pinned.length) host.append(h('div', { class: 'section-head' }, `All projects`));
    host.append(h('div', { class: 'grid' }, rest.map((r) => card(r, handlers))));
  }
}

function card(repo, handlers) {
  const m = metaFor(repo.full_name);
  const q = state.query.trim();
  const loc = repo.loc || { total: 0, byLang: [] };

  const badges = h('div', { class: 'card__badges' });
  if (repo.private) badges.append(h('span', { class: 'badge badge--private', title: 'Private repository' }, 'Private'));
  if (repo.is_template) badges.append(h('span', { class: 'badge badge--template' }, 'Template'));
  if (repo.fork) badges.append(h('span', { class: 'badge badge--fork' }, 'Fork'));
  if (repo.archived) badges.append(h('span', { class: 'badge badge--archived' }, 'Archived'));
  if (repo.hasPages) badges.append(h('span', { class: 'badge badge--pages badge--dot', title: repo.pagesUrl }, 'Live'));

  const pin = h('button', {
    class: 'card__pin' + (m.pinned ? ' is-on' : ''),
    title: m.pinned ? 'Unpin' : 'Pin to top',
    'aria-label': m.pinned ? 'Unpin' : 'Pin to top',
    on: { click: (e) => { e.stopPropagation(); handlers.onTogglePin(repo); } },
  }, icon(m.pinned ? 'star' : 'starOutline'));
  badges.append(pin);

  const bar = h('div', { class: 'langbar', title: loc.byLang.slice(0, 5).map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(' · ') });
  for (const l of loc.byLang.slice(0, 6)) {
    bar.append(h('span', { style: { width: `${l.pct}%`, background: l.color } }));
  }
  if (!loc.byLang.length) bar.append(h('span', { style: { width: '100%', background: 'var(--bg-hover)' } }));

  const stats = h('div', { class: 'card__stats' },
    h('span', { class: 'stat stat--loc', title: 'Estimated from language byte counts' },
      icon('code'), h('strong', { text: compact(loc.total) }), 'lines'),
    repo.language && h('span', { class: 'stat', title: 'Primary language' },
      h('span', { class: 'langdot', style: { background: langColor(repo.language) } }), repo.language),
    repo.stargazers_count > 0 && h('span', { class: 'stat' }, icon('star'), h('strong', { text: compact(repo.stargazers_count) })),
    repo.forks_count > 0 && h('span', { class: 'stat' }, icon('fork'), h('strong', { text: compact(repo.forks_count) })),
    repo.open_issues_count > 0 && h('span', { class: 'stat', title: 'Open issues and PRs' },
      icon('issue'), h('strong', { text: compact(repo.open_issues_count) })),
  );

  const tags = h('div', { class: 'card__tags' });
  if (m.status) tags.append(h('span', { class: `status-chip st-${m.status}`, text: statusLabel(m.status) }));
  for (const t of (m.tags || []).slice(0, 3)) {
    tags.append(h('span', { class: 'tag', style: { color: tagColor(t) }, text: t }));
  }
  if ((m.tags || []).length > 3) tags.append(h('span', { class: 'tag tag--muted', text: `+${m.tags.length - 3}` }));

  const stale = daysSince(repo.pushed_at);
  const accent = repo.hasPages ? 'var(--success)' : m.pinned ? 'var(--warn)' : 'var(--accent)';

  const el = h('article', {
    class: 'card' + (m.pinned ? ' is-pinned' : ''),
    tabindex: '0',
    role: 'button',
    style: { '--card-accent': accent },
    dataset: { repo: repo.full_name },
    on: {
      click: () => handlers.onOpen(repo),
      keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onOpen(repo); } },
    },
  },
    h('div', { class: 'card__top' },
      h('h3', { class: 'card__title', html: markMatch(repo.name, q) }),
      badges),
    h('p', { class: 'card__desc' + (repo.description ? '' : ' is-empty'),
      html: repo.description ? markMatch(repo.description, q) : 'No description' }),
    bar,
    stats,
    h('div', { class: 'card__foot' },
      tags,
      h('span', { class: 'card__when', title: new Date(repo.pushed_at).toLocaleString(),
        style: stale > 365 ? { opacity: '.65' } : {}, text: relTime(repo.pushed_at) })),
  );
  return el;
}

function emptyState(handlers) {
  const filtered = state.query || state.filters.status || state.filters.lang || state.filters.tag || state.pagesOnly;
  return h('div', { class: 'empty' },
    h('h3', { text: filtered ? 'Nothing matches those filters' : 'No repositories found' }),
    h('p', { text: filtered
      ? 'Try a looser search, or clear the filters.'
      : 'This account has no public repositories. Add a token in Settings to include private ones.' }),
    filtered && h('button', { class: 'btn', text: 'Clear filters', on: { click: handlers.onClearFilters } }),
  );
}

/* ── Live sites gallery ───────────────────────────────────────────── */

let frameObserver = null;

export function renderLive(host, handlers) {
  const { all } = visibleRepos();
  const sites = all.filter((r) => r.hasPages);
  clear(host);

  if (!sites.length) {
    host.append(h('div', { class: 'empty' },
      h('h3', { text: 'No GitHub Pages sites yet' }),
      h('p', { text: 'Repos with Pages enabled show up here as live, scrollable previews.' }),
      h('a', { class: 'btn', href: 'https://docs.github.com/pages/getting-started-with-github-pages', target: '_blank', rel: 'noopener', text: 'How to publish a Pages site' })));
    return;
  }

  frameObserver?.disconnect();
  frameObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      loadFrame(e.target);
      frameObserver.unobserve(e.target);
    }
  }, { rootMargin: '300px' });

  const grid = h('div', { class: 'livegrid' });
  for (const repo of sites) grid.append(liveCard(repo, handlers));
  host.append(grid);
}

function liveCard(repo, handlers) {
  const frame = h('div', { class: 'livecard__frame', dataset: { url: repo.pagesUrl } },
    h('div', { class: 'livecard__load' }, h('span', { text: 'Loading preview…' })));

  const el = h('div', { class: 'livecard' },
    frame,
    h('div', { class: 'livecard__bar' },
      h('div', { class: 'livecard__meta' },
        h('div', { class: 'livecard__name', text: repo.name }),
        h('div', { class: 'livecard__url', text: repo.pagesUrl.replace(/^https?:\/\//, '') })),
      h('div', { class: 'livecard__actions' },
        h('button', { class: 'btn btn--sm', text: 'Details', on: { click: () => handlers.onOpen(repo) } }),
        h('a', { class: 'btn btn--sm btn--primary', href: repo.pagesUrl, target: '_blank', rel: 'noopener',
          html: `Open ${iconSvg('external')}` }))),
  );
  frameObserver?.observe(frame);
  return el;
}

/** Width the preview pretends to be, then scales down to fit the card. */
const PREVIEW_WIDTH = 1280;

function loadFrame(frame) {
  const url = frame.dataset.url;
  const scale = (frame.clientWidth || 400) / PREVIEW_WIDTH;
  const iframe = h('iframe', {
    src: url, loading: 'lazy', referrerpolicy: 'no-referrer',
    sandbox: 'allow-scripts allow-same-origin allow-popups',
    title: `Preview of ${url}`,
    style: {
      width: `${PREVIEW_WIDTH}px`,
      height: `${Math.round((frame.clientHeight || 250) / scale)}px`,
      transform: `scale(${scale})`,
    },
  });
  iframe.addEventListener('load', () => frame.querySelector('.livecard__load')?.remove());
  setTimeout(() => {
    const loader = frame.querySelector('.livecard__load span');
    if (loader) loader.textContent = 'Preview blocked or still loading — use Open';
  }, 8000);
  frame.prepend(iframe);
  frame.append(h('a', { class: 'livecard__veil', href: url, target: '_blank', rel: 'noopener',
    title: 'Open in a new tab', 'aria-label': `Open ${url}` }));
}

/* ── Languages view ───────────────────────────────────────────────── */

export function renderLanguages(host, handlers) {
  // Follows the search box and filters, same as the other two views.
  const { all } = visibleRepos();
  const agg = aggregateLanguages(all);
  // "Filtered" means narrowed past the baseline, not just forks/archived being off.
  const baseline = portfolioStats().list.length;
  const filtered = all.length !== baseline;
  clear(host);

  if (!agg.byLang.length) {
    host.append(h('div', { class: 'empty' },
      h('h3', { text: all.length ? 'No language data for these projects' : 'Nothing matches those filters' }),
      h('p', { text: all.length
        ? 'GitHub reports no measurable code in the matching repos.'
        : 'Try a looser search, or clear the filters.' }),
      filtered && h('button', { class: 'btn', text: 'Clear filters', on: { click: handlers.onClearFilters } })));
    return;
  }

  const list = h('div', { class: 'langlist' });
  for (const l of agg.byLang) {
    const repoCount = all.filter((r) => (r.langBytes || {})[l.name]).length;
    list.append(h('button', {
      class: 'langrow',
      title: `Filter to ${l.name}`,
      on: { click: () => handlers.onPickLanguage(l.name) },
    },
      h('span', { class: 'langdot', style: { background: l.color } }),
      h('span', { class: 'langrow__name', text: l.name }),
      h('span', { class: 'langrow__loc', text: `${compact(l.lines)} lines` }),
      h('span', { class: 'langrow__pct', text: `${l.pct.toFixed(1)}%` }),
      h('span', { class: 'langrow__track' }, h('span', { class: 'langrow__fill', style: { width: `${Math.max(l.pct, 0.6)}%`, background: l.color } })),
      h('span', { class: 'langrow__pct', style: { gridColumn: '1 / -1', textAlign: 'left', width: 'auto', marginTop: '2px' },
        text: `${repoCount} project${repoCount === 1 ? '' : 's'}` }),
    ));
  }

  host.append(h('div', { class: 'langview' },
    h('div', {}, h('div', { class: 'section-head' }, 'By estimated lines'), list),
    h('div', { class: 'panel' },
      h('h4', { text: filtered ? `Mix across ${all.length} matching project${all.length === 1 ? '' : 's'}` : 'Portfolio mix' }),
      donut(agg),
      filtered && h('p', { style: { textAlign: 'center', fontSize: '12px', color: 'var(--text-faint)', margin: '4px 0 0' } },
        `Filtered from ${baseline} projects · `,
        h('button', { class: 'btn btn--sm btn--ghost', text: 'show all', on: { click: handlers.onClearFilters } })),
    ),
  ));
}

function donut(agg) {
  const size = 260, r = 96, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const top = agg.byLang.slice(0, 9);
  const otherPct = agg.byLang.slice(9).reduce((n, l) => n + l.pct, 0);
  const slices = otherPct > 0.05 ? [...top, { name: 'Other', pct: otherPct, color: '#6b7787', lines: 0 }] : top;

  let offset = 0;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Language distribution');

  for (const s of slices) {
    const len = (s.pct / 100) * circ;
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', s.color);
    c.setAttribute('stroke-width', '26');
    c.setAttribute('stroke-dasharray', `${Math.max(len - 1.5, 0)} ${circ - Math.max(len - 1.5, 0)}`);
    c.setAttribute('stroke-dashoffset', `${-offset}`);
    c.setAttribute('transform', `rotate(-90 ${cx} ${cy})`);
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    t.textContent = `${s.name} — ${s.pct.toFixed(1)}%`;
    c.append(t);
    svg.append(c);
    offset += len;
  }

  const total = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  total.setAttribute('x', cx); total.setAttribute('y', cy - 4);
  total.setAttribute('text-anchor', 'middle');
  total.setAttribute('fill', 'currentColor');
  total.setAttribute('font-size', '30');
  total.setAttribute('font-weight', '650');
  total.textContent = compact(agg.total);
  const sub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  sub.setAttribute('x', cx); sub.setAttribute('y', cy + 18);
  sub.setAttribute('text-anchor', 'middle');
  sub.setAttribute('fill', 'currentColor');
  sub.setAttribute('font-size', '12');
  sub.setAttribute('opacity', '.6');
  sub.textContent = 'estimated lines';
  svg.append(total, sub);

  const legend = h('div', { class: 'card__stats', style: { justifyContent: 'center' } },
    slices.map((s) => h('span', { class: 'stat' },
      h('span', { class: 'langdot', style: { background: s.color } }), `${s.name} ${s.pct.toFixed(0)}%`)));

  return h('div', { class: 'langdonut' }, svg, legend);
}
