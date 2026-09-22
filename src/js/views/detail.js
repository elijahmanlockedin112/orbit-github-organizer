// Repo detail overlay: overview, code browser, live Pages preview, insights, notes.
import { h, clear, compact, withCommas, bytes, relTime, fullDate, decodeBase64, debounce, toast, tagColor } from '../util.js';
import { icon, iconSvg } from '../icons.js';
import { metaFor, saveMeta, STATUSES, allTags } from '../store.js';
import { estimateLines, countExact, countableFiles, COUNT_CONFIRM_AT } from '../loc.js';
import { markdownElement } from '../markdown.js';
import { renderCode, familyOf } from '../highlight.js';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;
const BINARY_EXT = /\.(zip|gz|tar|7z|rar|pdf|woff2?|ttf|otf|eot|mp[34]|mov|avi|webm|wav|ogg|exe|dll|so|dylib|class|jar|wasm|bin|dat|db|sqlite3?|psd|ai|sketch|blend|fbx|obj|ico|icns)$/i;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp', avif: 'image/avif' };

let current = null;   // { repo, tab, path }
let host = null;
let deps = null;

export function initDetail(node, dependencies) { host = node; deps = dependencies; }

export function isDetailOpen() { return !host.hidden; }

export function closeDetail() {
  host.hidden = true;
  clear(host);
  document.body.style.overflow = '';
  current = null;
  if (location.hash) history.replaceState(null, '', location.pathname);
}

export async function openDetail(repo, tab = 'overview') {
  current = { repo, tab, path: null };
  document.body.style.overflow = 'hidden';
  host.hidden = false;
  host.scrollTop = 0;
  draw();
}

function setTab(tab) { current.tab = tab; draw(); }

/* ── Frame ────────────────────────────────────────────────────────── */

function draw() {
  const { repo, tab } = current;
  const m = metaFor(repo.full_name);
  clear(host);

  const tabs = [
    ['overview', 'Overview'],
    ['code', 'Code'],
    ...(repo.hasPages ? [['live', 'Live site']] : []),
    ['insights', 'Insights'],
    ['notes', 'Organize'],
  ];

  const panel = h('div', { class: 'dpanel' });

  const wrap = h('div', { class: 'dwrap' },
    header(repo, m),
    statRow(repo, m),
    h('nav', { class: 'dtabs' }, tabs.map(([id, label]) =>
      h('button', {
        class: 'dtab' + (tab === id ? ' is-active' : ''),
        text: label,
        on: { click: () => setTab(id) },
      }))),
    panel,
  );
  host.append(wrap);

  if (tab === 'overview') panelOverview(panel, repo);
  else if (tab === 'code') panelCode(panel, repo);
  else if (tab === 'live') panelLive(panel, repo);
  else if (tab === 'insights') panelInsights(panel, repo);
  else panelNotes(panel, repo);
}

function header(repo, m) {
  const pin = h('button', {
    class: 'btn' + (m.pinned ? ' is-on' : ''),
    title: m.pinned ? 'Unpin' : 'Pin to top',
    on: { click: async () => { await saveMeta(repo.full_name, { pinned: !metaFor(repo.full_name).pinned }); deps.onChange(); draw(); } },
  }, icon(m.pinned ? 'star' : 'starOutline'), m.pinned ? 'Pinned' : 'Pin');

  const badges = [];
  if (repo.private) badges.push(h('span', { class: 'badge badge--private' }, 'Private'));
  if (repo.archived) badges.push(h('span', { class: 'badge badge--archived' }, 'Archived'));
  if (repo.fork) badges.push(h('span', { class: 'badge badge--fork' }, 'Fork'));
  if (m.status) badges.push(h('span', { class: `status-chip st-${m.status}`, text: STATUSES.find((s) => s.id === m.status)?.label }));

  return h('div', { class: 'dhead' },
    h('div', { class: 'dhead__main' },
      h('div', { class: 'dcrumb' },
        h('button', { class: 'btn btn--ghost btn--sm', on: { click: closeDetail } }, icon('back'), 'All projects'),
        '·', repo.owner.login, '/'),
      h('h2', { class: 'dtitle' }, repo.name, ...badges),
      repo.description && h('p', { class: 'ddesc', text: repo.description }),
      repo.topics?.length ? h('div', { class: 'card__tags', style: { marginTop: '10px' } },
        repo.topics.map((t) => h('span', { class: 'tag tag--muted', text: t }))) : null,
    ),
    h('div', { class: 'dactions' },
      pin,
      repo.hasPages && h('a', { class: 'btn btn--primary', href: repo.pagesUrl, target: '_blank', rel: 'noopener',
        html: `${iconSvg('globe')} Visit site` }),
      h('a', { class: 'btn', href: repo.html_url, target: '_blank', rel: 'noopener',
        html: `${iconSvg('external')} GitHub` }),
      h('button', { class: 'btn', title: 'Copy clone URL',
        on: { click: () => { navigator.clipboard.writeText(repo.clone_url); toast('Clone URL copied'); } } },
        icon('copy')),
      h('button', { class: 'btn btn--icon', title: 'Close (Esc)', on: { click: closeDetail } }, icon('close')),
    ),
  );
}

function statRow(repo, m) {
  const loc = repo.loc || { total: 0, code: 0 };
  const exact = m.exactLoc;
  const cells = [
    ['Lines of code', exact ? withCommas(exact.lines) : compact(loc.total), exact ? `exact · ${exact.files} files` : 'estimated'],
    ['Code only', compact(loc.code), 'excludes docs/data'],
    ['Repo size', bytes((repo.size || 0) * 1024), 'on disk'],
    ['Stars', withCommas(repo.stargazers_count), `${repo.forks_count} forks`],
    ['Open issues', withCommas(repo.open_issues_count), repo.has_issues ? 'issues on' : 'issues off'],
    ['Last push', relTime(repo.pushed_at), fullDate(repo.pushed_at)],
    ['Created', fullDate(repo.created_at), `${Math.round((Date.now() - new Date(repo.created_at)) / 31536000000 * 10) / 10} yrs old`],
    ['License', repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : '—', repo.default_branch],
  ];
  return h('div', { class: 'dstats' }, cells.map(([k, v, s]) =>
    h('div', { class: 'dstat' },
      h('div', { class: 'dstat__k', text: k }),
      h('div', { class: 'dstat__v', text: String(v) }),
      h('div', { class: 'stile__sub', text: s || '' }))));
}

/* ── Overview ─────────────────────────────────────────────────────── */

async function panelOverview(panel, repo) {
  panel.append(h('div', { class: 'md' }, h('p', { class: 'skeleton', text: 'Loading README…' })));
  try {
    const readme = await deps.gh.readme(repo);
    clear(panel);
    if (!readme?.content) {
      panel.append(h('div', { class: 'empty' },
        h('h3', { text: 'No README' }),
        h('p', { text: 'This repo has no README file to show.' }),
        h('button', { class: 'btn', text: 'Browse the code instead', on: { click: () => setTab('code') } })));
      return;
    }
    const text = decodeBase64(readme.content);
    panel.append(markdownElement(text, { repo: repo.full_name, branch: repo.default_branch }));
  } catch (err) {
    clear(panel);
    panel.append(errorBox(err));
  }
}

/* ── Code browser ─────────────────────────────────────────────────── */

async function panelCode(panel, repo) {
  const tree = h('div', { class: 'tree' }, h('div', { class: 'skeleton', style: { height: '16px', margin: '8px' } }));
  const viewer = h('div', { class: 'viewer' },
    h('div', { class: 'viewer__bar' }, h('span', { class: 'viewer__path', text: 'Loading file tree…' })),
    h('div', { class: 'viewer__body' }, h('div', { class: 'viewer__empty' }, 'Pick a file on the left')));
  panel.append(h('div', { class: 'codewrap' }, tree, viewer));

  let data;
  try { data = await deps.gh.tree(repo); }
  catch (err) { clear(tree); tree.append(errorBox(err)); return; }

  if (!data?.tree?.length) {
    clear(tree);
    tree.append(h('div', { class: 'empty', style: { padding: '30px 10px' } }, h('p', { text: 'Empty repository' })));
    return;
  }

  const nodes = data.tree.filter((n) => n.type === 'blob' || n.type === 'tree');
  const root = buildTree(nodes);
  const open = new Set(['']);
  // Open the first level, plus a src/app folder if there is one.
  for (const k of Object.keys(root.dirs)) open.add(k);

  let activePath = null;
  const filterInput = h('input', { type: 'search', placeholder: `Filter ${nodes.filter(n => n.type === 'blob').length} files…`, spellcheck: false });
  const listHost = h('div');

  const paint = () => {
    clear(listHost);
    const q = filterInput.value.trim().toLowerCase();
    if (q) {
      const hits = nodes.filter((n) => n.type === 'blob' && n.path.toLowerCase().includes(q)).slice(0, 300);
      if (!hits.length) listHost.append(h('div', { style: { padding: '12px', color: 'var(--text-faint)', fontSize: '12px' }, text: 'No matches' }));
      for (const n of hits) listHost.append(fileRow(n, n.path, 0));
    } else {
      renderDir(root, '', 0, listHost);
    }
  };

  function renderDir(dir, prefix, depth, into) {
    for (const name of Object.keys(dir.dirs).sort()) {
      const path = prefix ? `${prefix}/${name}` : name;
      const isOpen = open.has(path);
      into.append(h('button', {
        class: 'tnode tnode--dir',
        style: { paddingLeft: `${7 + depth * 13}px` },
        on: { click: () => { isOpen ? open.delete(path) : open.add(path); paint(); } },
      }, icon(isOpen ? 'folderOpen' : 'folder'), h('span', { class: 'tnode__name', text: name })));
      if (isOpen) renderDir(dir.dirs[name], path, depth + 1, into);
    }
    for (const f of dir.files.sort((a, b) => a.name.localeCompare(b.name))) {
      into.append(fileRow(f.node, f.name, depth));
    }
  }

  function fileRow(node, label, depth) {
    return h('button', {
      class: 'tnode' + (activePath === node.path ? ' is-active' : ''),
      style: { paddingLeft: `${7 + depth * 13}px` },
      title: node.path,
      dataset: { path: node.path },
      on: { click: () => showFile(node) },
    }, icon('file'), h('span', { class: 'tnode__name', text: label }),
       h('span', { class: 'tnode__size', text: node.size ? bytes(node.size) : '' }));
  }

  async function showFile(node) {
    activePath = node.path;
    for (const b of tree.querySelectorAll('.tnode')) b.classList.toggle('is-active', b.dataset.path === node.path);

    const bar = viewer.querySelector('.viewer__bar');
    const body = viewer.querySelector('.viewer__body');
    const dirs = node.path.split('/');
    const file = dirs.pop();
    clear(bar); clear(body);
    bar.append(
      h('span', { class: 'viewer__path', html: `${dirs.length ? dirs.join('/') + '/' : ''}<b>${file}</b>` }),
      h('span', { class: 'viewer__meta', text: bytes(node.size || 0) }),
      h('a', { class: 'btn btn--sm', target: '_blank', rel: 'noopener',
        href: `${repo.html_url}/blob/${repo.default_branch}/${node.path}`, html: iconSvg('external') }),
    );
    body.append(h('div', { class: 'viewer__empty' }, 'Loading…'));

    if (BINARY_EXT.test(node.path) && !IMAGE_EXT.test(node.path)) {
      clear(body);
      body.append(h('div', { class: 'viewer__empty' },
        icon('file'), h('div', { text: 'Binary file — not shown' }),
        h('div', { style: { fontSize: '12px' }, text: bytes(node.size || 0) })));
      return;
    }
    if ((node.size || 0) > 2_000_000) {
      clear(body);
      body.append(h('div', { class: 'viewer__empty' }, h('div', { text: 'File too large to preview (over 2 MB)' })));
      return;
    }

    let blob;
    try { blob = await deps.gh.blob(repo, node.sha, { size: node.size || 0 }); }
    catch (err) { clear(body); body.append(errorBox(err)); return; }
    if (activePath !== node.path) return; // user clicked something else meanwhile
    clear(body);
    if (!blob?.content) { body.append(h('div', { class: 'viewer__empty' }, 'Could not load this file.')); return; }

    const ext = node.path.split('.').pop().toLowerCase();
    if (IMAGE_EXT.test(node.path) && MIME[ext]) {
      body.append(h('img', { class: 'viewer__img', alt: node.path,
        src: `data:${MIME[ext]};base64,${blob.content.replace(/\s/g, '')}` }));
      return;
    }

    let text;
    try { text = decodeBase64(blob.content); }
    catch { body.append(h('div', { class: 'viewer__empty' }, 'Binary file — not shown')); return; }
    if (text.includes(' ')) { body.append(h('div', { class: 'viewer__empty' }, 'Binary file — not shown')); return; }

    const rows = text.split('\n');
    if (rows[rows.length - 1] === '') rows.pop(); // ignore the trailing newline
    bar.querySelector('.viewer__meta').textContent = `${withCommas(rows.length)} lines · ${bytes(node.size || 0)}`;

    if (/\.mdx?$/i.test(node.path)) {
      let rendered = true;
      const toggle = h('button', { class: 'btn btn--sm', text: 'Raw' });
      bar.insertBefore(toggle, bar.lastChild);
      const swap = () => {
        clear(body);
        body.append(rendered
          ? h('div', { style: { padding: '20px 24px' } }, markdownElement(text, { repo: repo.full_name, branch: repo.default_branch }))
          : renderCode(text, node.path));
        toggle.textContent = rendered ? 'Raw' : 'Rendered';
      };
      toggle.addEventListener('click', () => { rendered = !rendered; swap(); });
      swap();
      return;
    }

    body.append(renderCode(text, node.path));
  }

  clear(tree);
  tree.append(h('div', { class: 'tree__filter' }, filterInput), listHost);
  filterInput.addEventListener('input', debounce(paint, 120));
  paint();

  if (data.truncated) {
    tree.append(h('div', { style: { padding: '10px', fontSize: '11.5px', color: 'var(--warn)' },
      text: 'Tree truncated by GitHub — very large repo, some files are missing.' }));
  }

  // Auto-open something worth reading.
  const pick = nodes.find((n) => n.type === 'blob' && /^readme\.mdx?$/i.test(n.path))
    || nodes.find((n) => n.type === 'blob' && /^(index|main|app)\.(html|js|ts|tsx|jsx|py|go|rs)$/i.test(n.path))
    || nodes.find((n) => n.type === 'blob' && familyOf(n.path) !== 'plain' && (n.size || 0) > 200);
  if (pick) showFile(pick);
}

function buildTree(nodes) {
  const root = { dirs: {}, files: [] };
  for (const n of nodes) {
    if (n.type !== 'blob') continue;
    const parts = n.path.split('/');
    const name = parts.pop();
    let cur = root;
    for (const p of parts) {
      cur.dirs[p] ||= { dirs: {}, files: [] };
      cur = cur.dirs[p];
    }
    cur.files.push({ name, node: n });
  }
  return root;
}

/* ── Live site ────────────────────────────────────────────────────── */

function panelLive(panel, repo) {
  const frame = h('div', { class: 'livepanel__frame' });
  const iframe = h('iframe', { src: repo.pagesUrl, title: `${repo.name} live site`,
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms', referrerpolicy: 'no-referrer' });
  frame.append(iframe);

  const sizes = [['Desktop', ''], ['Tablet', 'is-tablet'], ['Mobile', 'is-mobile']];
  const btns = h('div', { class: 'vpbtns' }, sizes.map(([label, cls], i) =>
    h('button', { class: 'vpbtn' + (i === 0 ? ' is-on' : ''), text: label, on: { click: (e) => {
      frame.className = 'livepanel__frame' + (cls ? ' ' + cls : '');
      for (const b of btns.children) b.classList.remove('is-on');
      e.currentTarget.classList.add('is-on');
    } } })));

  panel.append(h('div', { class: 'livepanel' },
    h('div', { class: 'livepanel__bar' },
      h('div', { class: 'livepanel__dots' }, h('i'), h('i'), h('i')),
      h('div', { class: 'livepanel__url', text: repo.pagesUrl }),
      btns,
      h('button', { class: 'btn btn--sm', title: 'Reload', on: { click: () => { iframe.src = repo.pagesUrl + '?t=' + Date.now(); } } }, icon('refresh')),
      h('a', { class: 'btn btn--sm btn--primary', href: repo.pagesUrl, target: '_blank', rel: 'noopener', html: `Open ${iconSvg('external')}` })),
    frame));

  panel.append(h('p', { style: { fontSize: '12px', color: 'var(--text-faint)', marginTop: '10px' },
    text: 'Some sites refuse to be framed. If the preview stays blank, use Open.' }));
}

/* ── Insights ─────────────────────────────────────────────────────── */

async function panelInsights(panel, repo) {
  const loc = repo.loc || estimateLines({});
  const m = metaFor(repo.full_name);

  const langPanel = h('div', { class: 'panel' },
    h('h4', { text: 'Languages' }),
    h('div', { class: 'bars' }, loc.byLang.length
      ? loc.byLang.slice(0, 10).map((l) => h('div', {},
          h('div', { class: 'bar__head' },
            h('span', {}, h('span', { class: 'langdot', style: { background: l.color, display: 'inline-block', marginRight: '6px' } }), l.name),
            h('span', { text: `${compact(l.lines)} lines · ${l.pct.toFixed(1)}%` })),
          h('div', { class: 'bar__track' }, h('div', { class: 'bar__fill', style: { width: `${l.pct}%`, background: l.color } }))))
      : h('p', { style: { color: 'var(--text-faint)', fontSize: '13px' }, text: 'No language data.' })));

  const exactHost = h('div', { class: 'panel' });
  drawExact(exactHost, repo, m);

  const activityPanel = h('div', { class: 'panel' }, h('h4', { text: 'Commits, last 52 weeks' }),
    h('div', { class: 'skeleton', style: { height: '64px' } }));
  const peoplePanel = h('div', { class: 'panel' }, h('h4', { text: 'Contributors' }),
    h('div', { class: 'skeleton', style: { height: '32px' } }));

  const facts = h('div', { class: 'panel' }, h('h4', { text: 'Facts' }),
    h('dl', { class: 'kv' },
      ...kv('Default branch', repo.default_branch),
      ...kv('Visibility', repo.private ? 'Private' : 'Public'),
      ...kv('Size on disk', bytes((repo.size || 0) * 1024)),
      ...kv('Watchers', withCommas(repo.watchers_count)),
      ...kv('Open issues', withCommas(repo.open_issues_count)),
      ...kv('Created', fullDate(repo.created_at)),
      ...kv('Last push', fullDate(repo.pushed_at)),
      ...kv('Homepage', repo.homepage || '—'),
      ...kv('Pages', repo.hasPages ? 'Published' : 'Not published'),
      ...kv('License', repo.license?.name || '—'),
    ));

  panel.append(h('div', { class: 'insights' }, langPanel, exactHost, activityPanel, peoplePanel, facts));

  // Activity + contributors load in the background.
  deps.gh.commitActivity(repo).then((weeks) => {
    clear(activityPanel);
    activityPanel.append(h('h4', { text: 'Commits, last 52 weeks' }));
    if (!Array.isArray(weeks) || !weeks.length) {
      activityPanel.append(h('p', { style: { color: 'var(--text-faint)', fontSize: '13px' },
        text: 'GitHub is still computing this. Check back in a minute.' }));
      return;
    }
    const total = weeks.reduce((n, w) => n + w.total, 0);
    activityPanel.append(sparkline(weeks.map((w) => w.total)));
    activityPanel.append(h('p', { style: { fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px', marginBottom: 0 },
      text: `${withCommas(total)} commits · busiest week ${Math.max(...weeks.map((w) => w.total))}` }));
  }).catch(() => { clear(activityPanel); activityPanel.append(h('h4', { text: 'Commits' }), errorBox(new Error('Unavailable'))); });

  deps.gh.contributors(repo).then((people) => {
    clear(peoplePanel);
    peoplePanel.append(h('h4', { text: 'Contributors' }));
    if (!Array.isArray(people) || !people.length) {
      peoplePanel.append(h('p', { style: { color: 'var(--text-faint)', fontSize: '13px' }, text: 'Just you.' }));
      return;
    }
    peoplePanel.append(h('div', { class: 'contribs' }, people.map((p) =>
      h('a', { class: 'contrib', href: p.html_url, target: '_blank', rel: 'noopener' },
        h('img', { src: p.avatar_url, alt: '', width: 22, height: 22, loading: 'lazy' }),
        p.login, h('b', { text: withCommas(p.contributions) })))));
  }).catch(() => { clear(peoplePanel); peoplePanel.append(h('h4', { text: 'Contributors' })); });
}

function drawExact(hostEl, repo, m) {
  clear(hostEl);
  hostEl.append(h('h4', { text: 'Exact line count' }));
  const exact = metaFor(repo.full_name).exactLoc;

  if (exact) {
    hostEl.append(
      h('div', { class: 'dstat__v', style: { fontSize: '30px' }, text: withCommas(exact.lines) }),
      h('p', { style: { color: 'var(--text-dim)', fontSize: '12.5px', margin: '4px 0 14px' },
        text: `${withCommas(exact.files)} source files · ${withCommas(exact.blank)} blank · counted ${relTime(exact.at)}` }),
      h('p', { style: { fontSize: '12px', color: 'var(--text-faint)', margin: '0 0 12px' },
        text: `Estimate said ${withCommas(repo.loc?.total || 0)} — off by ${Math.abs(Math.round(((repo.loc?.total || 0) / (exact.lines || 1) - 1) * 100))}%.` }),
      h('button', { class: 'btn btn--sm', text: 'Recount', on: { click: () => runCount(hostEl, repo) } }));
    return;
  }

  hostEl.append(
    h('p', { style: { color: 'var(--text-dim)', fontSize: '13px', margin: '0 0 14px' },
      text: 'The dashboard number is estimated from language byte counts. Walk the tree for a real count — one API request per source file, cached afterwards.' }),
    h('button', { class: 'btn', text: 'Count exactly', on: { click: () => runCount(hostEl, repo) } }));
}

async function runCount(hostEl, repo) {
  clear(hostEl);
  hostEl.append(h('h4', { text: 'Exact line count' }));
  const bar = h('div', { class: 'bar__track' }, h('div', { class: 'bar__fill', style: { width: '0%', background: 'var(--accent)' } }));
  const label = h('p', { style: { fontSize: '12.5px', color: 'var(--text-dim)', margin: '0 0 10px' }, text: 'Reading the file tree…' });
  hostEl.append(label, bar);

  try {
    const tree = await deps.gh.tree(repo);
    const todo = countableFiles(tree).length;
    if (todo > COUNT_CONFIRM_AT &&
        !confirm(`${repo.name} has ${todo.toLocaleString()} source files. Counting them exactly costs about that many GitHub API requests out of your hourly budget. Go ahead?`)) {
      drawExact(hostEl, repo, metaFor(repo.full_name));
      return;
    }
    const result = await countExact(deps.gh, repo, tree, (done, total) => {
      bar.firstChild.style.width = `${(done / total) * 100}%`;
      label.textContent = `Counting ${done} / ${total} files…`;
    });
    await saveMeta(repo.full_name, { exactLoc: { ...result, at: new Date().toISOString() } });
    deps.onChange();
    drawExact(hostEl, repo, metaFor(repo.full_name));
    if (result.truncated) toast('Repo too large for one tree request — count may be partial', 'error');
  } catch (err) {
    clear(hostEl);
    hostEl.append(h('h4', { text: 'Exact line count' }), errorBox(err),
      h('button', { class: 'btn btn--sm', text: 'Try again', on: { click: () => runCount(hostEl, repo) } }));
  }
}

function sparkline(values) {
  const w = 520, hgt = 64, max = Math.max(1, ...values);
  const step = w / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, hgt - (v / max) * (hgt - 6) - 2]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${hgt} L0 ${hgt} Z`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML =
    `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
       <stop offset="0%" stop-color="var(--accent)" stop-opacity=".35"/>
       <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
     </linearGradient></defs>
     <path d="${area}" fill="url(#sg)"/>
     <path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  return svg;
}

const kv = (k, v) => [h('dt', { text: k }), h('dd', { text: String(v) })];

/* ── Organize (status, tags, notes) ───────────────────────────────── */

function panelNotes(panel, repo) {
  const m = metaFor(repo.full_name);
  const savedFlag = h('span', { class: 'saved', text: 'Saved' });
  const flash = () => { savedFlag.classList.add('is-on'); setTimeout(() => savedFlag.classList.remove('is-on'), 1200); };

  const statusBtns = h('div', { class: 'statuspick' }, STATUSES.map((s) =>
    h('button', {
      class: 'btn btn--sm' + (m.status === s.id ? ' is-on' : ''),
      text: s.label,
      on: { click: async () => { await saveMeta(repo.full_name, { status: s.id }); deps.onChange(); draw(); } },
    })));

  const tagList = h('div', { class: 'taglist' });
  const paintTags = () => {
    clear(tagList);
    const tags = metaFor(repo.full_name).tags || [];
    if (!tags.length) tagList.append(h('span', { style: { fontSize: '12px', color: 'var(--text-faint)' }, text: 'No collections yet.' }));
    for (const t of tags) {
      tagList.append(h('span', { class: 'tag', style: { color: tagColor(t) }, title: 'Click to remove',
        on: { click: async () => { const cur = metaFor(repo.full_name).tags.filter((x) => x !== t); await saveMeta(repo.full_name, { tags: cur }); deps.onChange(); paintTags(); } } },
        t, h('b', { text: '×' })));
    }
  };
  paintTags();

  const tagInput = h('input', { type: 'text', placeholder: 'Add a collection…', list: 'orbit-tags', spellcheck: false });
  const datalist = h('datalist', { id: 'orbit-tags' }, allTags().map(([t]) => h('option', { value: t })));
  const addTag = async () => {
    const v = tagInput.value.trim();
    if (!v) return;
    const cur = new Set(metaFor(repo.full_name).tags || []);
    cur.add(v);
    await saveMeta(repo.full_name, { tags: [...cur] });
    tagInput.value = '';
    deps.onChange();
    paintTags();
  };
  tagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

  const notes = h('textarea', { placeholder: 'What is this project for? What is left to do? Anything you will forget in three months.', value: m.notes || '' });
  notes.addEventListener('input', debounce(async () => {
    await saveMeta(repo.full_name, { notes: notes.value });
    deps.onChange();
    flash();
  }, 500));

  panel.append(h('div', { class: 'organize' },
    h('div', { class: 'panel' },
      h('h4', { text: 'Status' }), statusBtns,
      h('h4', { style: { marginTop: '22px' }, text: 'Collections' }),
      h('div', { class: 'taginput' }, tagInput, h('button', { class: 'btn', text: 'Add', on: { click: addTag } })),
      datalist, tagList,
      h('h4', { style: { marginTop: '22px' }, text: 'Visibility' }),
      h('label', { class: 'chk' },
        h('input', { type: 'checkbox', checked: !!m.hidden, on: { change: async (e) => {
          await saveMeta(repo.full_name, { hidden: e.target.checked });
          deps.onChange();
          if (e.target.checked) { toast(`${repo.name} hidden from the dashboard`); }
        } } }),
        h('span', { text: 'Hide this repo from the dashboard' })),
    ),
    h('div', { class: 'panel' },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        h('h4', { text: 'Notes' }), savedFlag),
      notes,
      h('p', { style: { fontSize: '11.5px', color: 'var(--text-faint)', margin: '8px 0 0' },
        text: 'Notes, tags, status and pins live in this browser profile only — they are never pushed to GitHub.' }),
    ),
  ));
}

/* ── Shared ───────────────────────────────────────────────────────── */

function errorBox(err) {
  return h('div', { class: 'banner banner--error' }, h('span', { text: err?.message || 'Something went wrong.' }));
}
