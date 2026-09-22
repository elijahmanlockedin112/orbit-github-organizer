// A small, dependency-free syntax highlighter.
// Tokenises into [type, text] pairs so the viewer can split on newlines
// without ever breaking a span across two lines.
import { escapeHtml } from './util.js';

const KW = {
  js: 'as async await break case catch class const continue debugger default delete do else enum export extends finally for from function get if implements import in instanceof interface let new of package private protected public return satisfies set static super switch this throw try typeof var void while with yield',
  ts: 'abstract any asserts bigint boolean declare infer is keyof namespace never number object override readonly record require string symbol type undefined unique unknown',
  py: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case',
  rb: 'alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield',
  go: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  rs: 'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
  java: 'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while var record sealed',
  cs: 'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using var virtual void volatile while async await',
  c: 'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false nullptr namespace template typename class public private protected virtual override new delete using friend constexpr noexcept',
  php: 'abstract and array as break callable case catch class clone const continue declare default do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
  swift: 'associatedtype class deinit enum extension fileprivate func import init inout internal let open operator private protocol public rethrows static struct subscript typealias var break case continue default defer do else fallthrough for guard if in repeat return switch where while as catch is nil super self throw throws try any some',
  kt: 'as break by catch class companion const constructor continue crossinline data do dynamic else enum external false final finally for fun get if import in infix init inline interface internal is lateinit lazy noinline null object open operator out override package private protected public reified return sealed set super suspend this throw true try typealias val var vararg when where while',
  sh: 'if then else elif fi for while until do done case esac function return in select time coproc local export readonly declare typeset unset shift source alias set trap exit break continue',
  sql: 'select from where insert into values update set delete create table drop alter add column primary key foreign references index view join inner left right outer full on group by order having limit offset union all distinct as and or not null is in between like exists case when then else end begin commit rollback transaction with returning default constraint unique check cascade',
  lua: 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while',
};
const set = (s) => new Set(s.split(/\s+/));

const TYPES = set('String Number Boolean Object Array Function Symbol BigInt Promise Map Set WeakMap WeakSet Date RegExp Error JSON Math Infinity NaN console window document globalThis process Buffer int8 int16 int32 int64 uint8 uint16 uint32 uint64 usize isize f32 f64 str Vec Option Result Box Rc Arc HashMap String Self None True False self cls print len range dict list tuple int float bool bytes super this null undefined true false nil NULL')

const LITERAL = set('true false null nil None True False undefined NULL nullptr');

/** file extension -> highlighter family */
const BY_EXT = {
  js: 'cstyle', mjs: 'cstyle', cjs: 'cstyle', jsx: 'cstyle', ts: 'cstyle', tsx: 'cstyle',
  java: 'cstyle', c: 'cstyle', h: 'cstyle', cc: 'cstyle', cpp: 'cstyle', hpp: 'cstyle',
  cs: 'cstyle', go: 'cstyle', rs: 'cstyle', swift: 'cstyle', kt: 'cstyle', kts: 'cstyle',
  php: 'cstyle', dart: 'cstyle', scala: 'cstyle', sol: 'cstyle', groovy: 'cstyle',
  gradle: 'cstyle', proto: 'cstyle', glsl: 'cstyle', hlsl: 'cstyle', zig: 'cstyle',
  m: 'cstyle', mm: 'cstyle', json: 'cstyle', jsonc: 'cstyle',
  py: 'hash', rb: 'hash', sh: 'hash', bash: 'hash', zsh: 'hash', ps1: 'hash',
  pl: 'hash', r: 'hash', yml: 'hash', yaml: 'hash', toml: 'hash', ex: 'hash',
  exs: 'hash', nim: 'hash', jl: 'hash', tf: 'hash', hcl: 'hash', dockerfile: 'hash',
  makefile: 'hash', mk: 'hash', gitignore: 'hash', env: 'hash', conf: 'hash',
  ini: 'hash', cfg: 'hash', lua: 'hash',
  html: 'html', htm: 'html', xml: 'html', svg: 'html', vue: 'html', svelte: 'html',
  astro: 'html', hbs: 'html', ejs: 'html', xhtml: 'html',
  css: 'css', scss: 'css', sass: 'css', less: 'css', styl: 'css',
  md: 'md', markdown: 'md', mdx: 'md',
  sql: 'sql',
};

const KW_BY_EXT = {
  js: KW.js, mjs: KW.js, cjs: KW.js, jsx: KW.js,
  ts: KW.js + ' ' + KW.ts, tsx: KW.js + ' ' + KW.ts,
  py: KW.py, rb: KW.rb, go: KW.go, rs: KW.rs, java: KW.java, cs: KW.cs,
  c: KW.c, h: KW.c, cc: KW.c, cpp: KW.c, hpp: KW.c, m: KW.c, mm: KW.c,
  php: KW.php, swift: KW.swift, kt: KW.kt, kts: KW.kt, dart: KW.js, scala: KW.java,
  sol: KW.js + ' contract function modifier mapping address uint256 payable memory storage emit event require',
  sh: KW.sh, bash: KW.sh, zsh: KW.sh, ps1: KW.sh, lua: KW.lua, sql: KW.sql,
  groovy: KW.java, gradle: KW.java, zig: KW.rs, jl: KW.py, ex: KW.rb, exs: KW.rb,
};

export function langOf(path) {
  const base = path.split('/').pop().toLowerCase();
  if (base === 'dockerfile' || base === 'makefile') return base;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : base;
}

export function familyOf(path) { return BY_EXT[langOf(path)] || 'plain'; }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── Tokenisers ───────────────────────────────────────────────────── */

function cstyle(code, ext) {
  const kw = set(KW_BY_EXT[ext] || KW.js);
  const re = /(\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*)|(`(?:\\[\s\S]|[^`\\])*`?|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?)|(\b0[xXbBoO][0-9a-fA-F_]+\b|\b\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?[fFlLuUn]?\b)|([@#]?[A-Za-z_$][\w$]*)|([{}()[\];,.:?=<>!+\-*/%&|^~]+)/g;
  return scan(code, re, (m) => {
    if (m[1]) return 'com';
    if (m[2]) return 'str';
    if (m[3]) return 'num';
    if (m[4]) {
      const w = m[4];
      if (kw.has(w) || LITERAL.has(w)) return 'kw';
      if (w.startsWith('@') || w.startsWith('#')) return 'att';
      if (TYPES.has(w) || /^[A-Z][A-Za-z0-9_]*$/.test(w)) return 'typ';
      return null;
    }
    if (m[5]) return 'pun';
    return null;
  }, (m, rest) => (m[4] && !m[4].startsWith('@') && /^\s*\(/.test(rest) ? 'fn' : null));
}

function hashStyle(code, ext) {
  const kw = set(KW_BY_EXT[ext] || KW.py);
  const re = /(#[^\n]*|--[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\[\s\S]|[^"\\\n])*"?|'(?:\\[\s\S]|[^'\\\n])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(\$\{?[A-Za-z_]\w*\}?)|(\b\d[\d_]*(?:\.\d+)?\b)|(@?[A-Za-z_][\w.-]*)|([{}()[\];,:?=<>!+\-*/%&|^~]+)/g;
  return scan(code, re, (m) => {
    if (m[1]) return 'com';
    if (m[2]) return 'str';
    if (m[3]) return 'att';
    if (m[4]) return 'num';
    if (m[5]) {
      const w = m[5];
      if (kw.has(w) || LITERAL.has(w)) return 'kw';
      if (w.startsWith('@')) return 'att';
      if (TYPES.has(w) || /^[A-Z][A-Za-z0-9_]*$/.test(w)) return 'typ';
      return null;
    }
    if (m[6]) return 'pun';
    return null;
  }, (m, rest) => (m[5] && /^\s*\(/.test(rest) ? 'fn' : null));
}

function sqlStyle(code) {
  const kw = set(KW.sql);
  const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:''|[^'])*'?|"(?:[^"])*"?|`[^`]*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|([{}()[\];,.:?=<>!+\-*/%|]+)/g;
  return scan(code, re, (m) => {
    if (m[1]) return 'com';
    if (m[2]) return 'str';
    if (m[3]) return 'num';
    if (m[4]) return kw.has(m[4].toLowerCase()) ? 'kw' : null;
    if (m[5]) return 'pun';
    return null;
  });
}

function cssStyle(code) {
  const re = /(\/\*[\s\S]*?(?:\*\/|$)|\/\/[^\n]*)|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(@[\w-]+|\$[\w-]+|--[\w-]+)|(#[0-9a-fA-F]{3,8}\b)|(-?\b\d*\.?\d+(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|turn|fr|ch|ex|pt|pc|cm|mm|in|dpi)?\b)|([A-Za-z-]+)(?=\s*:)|([.#&][\w-]+|::?[\w-]+)|([{}();:,>+~]+)/g;
  return scan(code, re, (m) => {
    if (m[1]) return 'com';
    if (m[2]) return 'str';
    if (m[3]) return 'kw';
    if (m[4]) return 'num';
    if (m[5]) return 'num';
    if (m[6]) return 'att';
    if (m[7]) return 'typ';
    if (m[8]) return 'pun';
    return null;
  });
}

function htmlStyle(code) {
  const out = [];
  // Pull <script>/<style> blocks out and highlight their bodies properly.
  const blocks = /(<(script|style)\b[^>]*>)([\s\S]*?)(<\/\2\s*>)/gi;
  let last = 0, m;
  while ((m = blocks.exec(code))) {
    out.push(...htmlTags(code.slice(last, m.index)));
    out.push(...htmlTags(m[1]));
    const inner = m[3];
    if (inner.trim()) {
      out.push(...(m[2].toLowerCase() === 'script' ? cstyle(inner, 'js') : cssStyle(inner)));
    } else if (inner) out.push([null, inner]);
    out.push(...htmlTags(m[4]));
    last = m.index + m[0].length;
  }
  out.push(...htmlTags(code.slice(last)));
  return out;
}

function htmlTags(code) {
  const re = /(<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?\]\]>)|(<[!/]?[A-Za-z][\w:.-]*|<!DOCTYPE)|("(?:[^"]*)"?|'(?:[^']*)'?)|([A-Za-z_:@#][\w:.-]*)(?=\s*=)|(\{\{[^}]*\}\}|\{[^}\n]*\})|(\/?>)/g;
  return scan(code, re, (m) => {
    if (m[1]) return 'com';
    if (m[2]) return 'tag';
    if (m[3]) return 'str';
    if (m[4]) return 'att';
    if (m[5]) return 'kw';
    if (m[6]) return 'tag';
    return null;
  });
}

function mdStyle(code) {
  const re = /(^```[\s\S]*?(?:^```|$))|(^#{1,6}[ \t].*$)|(^[ \t]*[-*+>][ \t]|^[ \t]*\d+\.[ \t])|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(`[^`\n]+`)|(\[[^\]\n]*\]\([^)\n]*\))|(^[ \t]*\|.*\|[ \t]*$)/gm;
  return scan(code, re, (m) => {
    if (m[1]) return 'str';
    if (m[2]) return 'kw';
    if (m[3]) return 'pun';
    if (m[4]) return 'typ';
    if (m[5]) return 'str';
    if (m[6]) return 'att';
    if (m[7]) return 'pun';
    return null;
  });
}

/** Shared driver: walk regex matches, emitting [type|null, text] pairs. */
function scan(code, re, classify, lookahead) {
  const out = [];
  let last = 0, m;
  re.lastIndex = 0;
  while ((m = re.exec(code))) {
    if (m.index > last) out.push([null, code.slice(last, m.index)]);
    let type = classify(m);
    if (!type && lookahead) type = lookahead(m, code.slice(m.index + m[0].length, m.index + m[0].length + 8));
    out.push([type, m[0]]);
    last = m.index + m[0].length;
    if (re.lastIndex === m.index) re.lastIndex++; // guard against zero-length matches
  }
  if (last < code.length) out.push([null, code.slice(last)]);
  return out;
}

/** Tokenise `code` for the language implied by `path`. */
export function tokenize(code, path) {
  const ext = langOf(path);
  switch (familyOf(path)) {
    case 'cstyle': return cstyle(code, ext);
    case 'hash':   return hashStyle(code, ext);
    case 'html':   return htmlStyle(code);
    case 'css':    return cssStyle(code);
    case 'md':     return mdStyle(code);
    case 'sql':    return sqlStyle(code);
    default:       return [[null, code]];
  }
}

/**
 * Render highlighted code as numbered rows.
 * @returns {HTMLPreElement}
 */
export function renderCode(code, path, { startLine = 1 } = {}) {
  const pre = document.createElement('pre');
  pre.className = 'code';

  const tokens = code.length > 400_000 ? [[null, code]] : tokenize(code, path);
  const rows = [[]];
  for (const [type, text] of tokens) {
    const parts = text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) rows.push([]);
      if (parts[i]) rows[rows.length - 1].push([type, parts[i]]);
    }
  }
  if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();

  const width = String(rows.length + startLine - 1).length;
  pre.style.setProperty('--ln-w', `${Math.max(2, width)}ch`);

  const html = rows.map((row, i) => {
    const src = row.map(([t, s]) => (t ? `<span class="tk-${t}">${escapeHtml(s)}</span>` : escapeHtml(s))).join('');
    return `<span class="row"><span class="ln">${i + startLine}</span><span class="src">${src || ' '}</span></span>`;
  }).join('\n');

  pre.innerHTML = html;
  return pre;
}

/** Highlight a fenced code block from a README (no line numbers). */
export function highlightInline(code, lang) {
  const path = `x.${(lang || '').toLowerCase()}`;
  return tokenize(code, path)
    .map(([t, s]) => (t ? `<span class="tk-${t}">${escapeHtml(s)}</span>` : escapeHtml(s)))
    .join('');
}

export const KNOWN_EXTENSIONS = Object.keys(BY_EXT);
export { esc as escapeRegex };
