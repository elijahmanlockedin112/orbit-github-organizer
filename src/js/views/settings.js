// Settings modal: account, display, and local data management.
import { h, clear, bytes, toast, relTime } from '../util.js';
import { icon } from '../icons.js';
import { getSettings, saveSettings, cache, exportData, importData, wipeEverything, allMeta } from '../store.js';

let host = null;
let deps = null;

export function initSettings(node, dependencies) { host = node; deps = dependencies; }
export const isSettingsOpen = () => !host.hidden;
export function closeSettings() { host.hidden = true; clear(host); }

export async function openSettings() {
  const s = getSettings();
  host.hidden = false;
  clear(host);

  const userInput = h('input', { type: 'text', value: s.user, spellcheck: false, autocomplete: 'off' });
  const tokenInput = h('input', { type: 'password', value: s.token, placeholder: s.token ? '' : 'ghp_… (optional)', spellcheck: false, autocomplete: 'off' });
  const autoInput = h('select', { class: 'select', style: { maxWidth: 'none' } },
    [[0, 'Only when I ask'], [15, 'Every 15 minutes'], [60, 'Every hour'], [360, 'Every 6 hours'], [1440, 'Once a day']]
      .map(([v, label]) => h('option', { value: String(v), text: label, selected: Number(s.autoRefreshMins) === v })));
  const liveInput = h('input', { type: 'checkbox', checked: s.livePreviews !== false });

  const cacheLine = h('span', { class: 'modal__note', text: 'measuring…' });
  cache.size().then((n) => { cacheLine.textContent = `${bytes(n)} cached · last sync ${s.lastSync ? relTime(new Date(s.lastSync).toISOString()) : 'never'}`; });

  const fileInput = h('input', { type: 'file', accept: 'application/json', hidden: true,
    on: { change: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const count = await importData(JSON.parse(await file.text()));
        toast(`Imported notes for ${count} repos`);
        deps.onChange();
        openSettings();
      } catch (err) { toast(err.message || 'Could not read that file', 'error'); }
    } } });

  const body = h('div', { class: 'modal__body' },
    section('Account',
      field('GitHub username', userInput),
      field('Personal access token', tokenInput,
        'Stored in this browser profile only. A classic token with no scopes lifts the rate limit to 5,000/hour; add the repo scope to include private repositories.'),
      h('div', { style: { display: 'flex', gap: '8px' } },
        h('a', { class: 'btn btn--sm', target: '_blank', rel: 'noopener',
          href: 'https://github.com/settings/tokens/new?description=Orbit%20project%20organizer', text: 'Create a token' }),
        s.token && h('button', { class: 'btn btn--sm btn--danger', text: 'Remove token',
          on: { click: async () => { await saveSettings({ token: '' }); toast('Token removed'); deps.onReconnect(); openSettings(); } } }))),

    section('Display',
      h('label', { class: 'chk', style: { marginBottom: '12px' } }, liveInput,
        h('span', { text: 'Load live previews in the Live Sites gallery' })),
      field('Refresh from GitHub', autoInput)),

    section('Your data',
      h('p', { class: 'modal__note', style: { margin: '0 0 12px' } },
        `Pins, statuses, collections and notes for ${Object.keys(allMeta()).length} repos are stored locally. Nothing is sent anywhere except api.github.com.`),
      cacheLine,
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' } },
        h('button', { class: 'btn btn--sm', text: 'Clear API cache', on: { click: async () => {
          const n = await cache.purge();
          toast(`Cleared ${n} cached responses`);
          openSettings();
        } } }),
        h('button', { class: 'btn btn--sm', text: 'Export notes', on: { click: async () => {
          const data = await exportData();
          const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
          const a = h('a', { href: url, download: `orbit-backup-${new Date().toISOString().slice(0, 10)}.json` });
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } } }),
        h('button', { class: 'btn btn--sm', text: 'Import notes', on: { click: () => fileInput.click() } }),
        fileInput,
        h('button', { class: 'btn btn--sm btn--danger', text: 'Reset everything', on: { click: async () => {
          if (!confirm('Delete the token, all notes, tags, pins and cached data from this browser? This cannot be undone.')) return;
          await wipeEverything();
          location.reload();
        } } }))),

    section('About',
      h('p', { class: 'modal__note', style: { margin: 0 } },
        'Orbit 1.0 — a local GitHub portfolio dashboard. Line counts on cards are estimated from GitHub’s per-language byte totals; open a repo and use "Count exactly" in Insights for a real count.')),
  );

  host.append(h('div', { class: 'modal__card' },
    h('div', { class: 'modal__head' },
      h('h3', { text: 'Settings' }),
      h('button', { class: 'btn btn--icon btn--ghost', 'aria-label': 'Close', on: { click: closeSettings } }, icon('close'))),
    body,
    h('div', { class: 'modal__foot' },
      h('button', { class: 'btn', text: 'Cancel', on: { click: closeSettings } }),
      h('button', { class: 'btn btn--primary', text: 'Save', on: { click: async () => {
        const nextUser = userInput.value.trim().replace(/^@/, '');
        const changedAccount = nextUser !== s.user || tokenInput.value !== s.token;
        await saveSettings({
          user: nextUser,
          token: tokenInput.value.trim(),
          autoRefreshMins: Number(autoInput.value),
          livePreviews: liveInput.checked,
        });
        closeSettings();
        if (changedAccount) deps.onReconnect();
        else deps.onChange();
        toast('Settings saved');
      } } }))));

  host.addEventListener('click', (e) => { if (e.target === host) closeSettings(); });
}

function section(title, ...children) {
  return h('section', { style: { marginBottom: '26px' } },
    h('h4', { style: { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-faint)', marginBottom: '12px' }, text: title }),
    ...children);
}

function field(label, input, help) {
  return h('label', { class: 'field' },
    h('span', { class: 'field__label', text: label }),
    input,
    help && h('span', { class: 'field__help', text: help }));
}
