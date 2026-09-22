// Language colours + the line-count estimator.
//
// GitHub's API reports bytes per language, never line counts. Dividing by a
// per-language average of bytes-per-line gets within roughly ±15% on normal
// source trees, for one cheap request per repo. Everything derived from this
// is labelled "est." in the UI.

export const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', HTML: '#e34c26',
  CSS: '#563d7c', SCSS: '#c6538c', Less: '#1d365d', Java: '#b07219', C: '#555555',
  'C++': '#f34b7d', 'C#': '#178600', Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516',
  PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051',
  PowerShell: '#012456', Batchfile: '#C1F12E', Vue: '#41b883', Svelte: '#ff3e00',
  Astro: '#ff5a03', 'Jupyter Notebook': '#DA5B0B', R: '#198CE7', Lua: '#000080',
  Perl: '#0298c3', Scala: '#c22d40', Haskell: '#5e5086', Elixir: '#6e4a7e',
  Erlang: '#B83998', Clojure: '#db5855', OCaml: '#ef7a08', 'F#': '#b845fc',
  Julia: '#a270ba', Nim: '#ffc200', Zig: '#ec915c', Solidity: '#AA6746',
  'Objective-C': '#438eff', Assembly: '#6E4C13', Makefile: '#427819', Dockerfile: '#384d54',
  Markdown: '#083fa1', TeX: '#3D6117', SQL: '#e38c00', PLpgSQL: '#336790',
  HCL: '#844FBA', Nix: '#7e7eff', Vim: '#199f4b', 'Vim Script': '#199f4b',
  'Emacs Lisp': '#c065db', 'Common Lisp': '#3fb68b', Scheme: '#1e4aec',
  Fortran: '#4d41b1', COBOL: '#1a7f37', Pascal: '#E3F171', Groovy: '#4298b8',
  Handlebars: '#f7931e', EJS: '#a91e50', Pug: '#a86454', Twig: '#c1d026',
  Blade: '#f7523f', Smarty: '#f0c040', ASP: '#6a40fd', ColdFusion: '#ed2cd6',
  Crystal: '#000100', D: '#ba595e', Elm: '#60B5CC', GDScript: '#355570',
  GLSL: '#5686a5', HLSL: '#aace60', Hack: '#878787', Haxe: '#df7900',
  Idris: '#b30000', Io: '#a9188d', Jsonnet: '#0064bd', Less_: '#1d365d',
  Mathematica: '#dd1100', MATLAB: '#e16737', Prolog: '#74283c', Puppet: '#302B6D',
  PureScript: '#1D222D', Racket: '#3c5caa', Raku: '#0000fb', ReScript: '#ed5051',
  Reason: '#ff5847', SaltStack: '#646464', Sass: '#a53b70', Stylus: '#ff6347',
  Tcl: '#e4cc98', Terraform: '#844FBA', Verilog: '#b2b7f8', VHDL: '#adb2cb',
  'Visual Basic .NET': '#945db7', WebAssembly: '#04133b', XSLT: '#EB8CEB',
  YAML: '#cb171e', JSON: '#292929', TOML: '#9c4221', XML: '#0060ac',
  Text: '#8f8f8f', Roff: '#ecdebe', 'Rich Text Format': '#8f8f8f',
  CMake: '#DA3434', Meson: '#007800', Just: '#384d54', Nushell: '#4E9906',
  Procfile: '#8f8f8f', 'Protocol Buffer': '#7fa2a0', Thrift: '#D12127',
  GraphQL: '#e10098', Cython: '#fedf5b', Starlark: '#76d275', Bicep: '#519aba',
};

export const langColor = (name) => LANG_COLORS[name] || '#8b949e';

/** Average bytes per line, per language. Default 34. */
const BYTES_PER_LINE = {
  JavaScript: 32, TypeScript: 34, 'TSX': 34, JSX: 32, Python: 30, HTML: 42, CSS: 28,
  SCSS: 28, Sass: 26, Less: 28, Stylus: 25, Java: 36, C: 30, 'C++': 32, 'C#': 35,
  Go: 29, Rust: 33, Ruby: 27, PHP: 32, Swift: 34, Kotlin: 33, Dart: 31, Shell: 28,
  PowerShell: 35, Batchfile: 28, Vue: 33, Svelte: 32, Astro: 34, R: 30, Lua: 26,
  Perl: 30, Scala: 34, Haskell: 30, Elixir: 28, Erlang: 30, Clojure: 27, OCaml: 30,
  'F#': 30, Julia: 28, Nim: 28, Zig: 32, Solidity: 35, 'Objective-C': 36,
  Assembly: 24, Makefile: 26, Dockerfile: 28, CMake: 30, Markdown: 48, TeX: 42,
  SQL: 31, PLpgSQL: 32, HCL: 30, Terraform: 30, Nix: 30, 'Vim Script': 28,
  'Emacs Lisp': 30, 'Common Lisp': 30, Scheme: 28, Fortran: 32, Pascal: 32,
  Groovy: 32, Handlebars: 40, EJS: 38, Pug: 24, Twig: 38, Blade: 40,
  YAML: 30, JSON: 28, TOML: 26, XML: 44, Text: 48, GraphQL: 26,
  'Jupyter Notebook': 95,  // notebooks are JSON with embedded outputs
  SVG: 120,                // path data, not lines a human wrote
  Roff: 40,
};

/** Languages that are markup/data rather than code — tracked but reported apart. */
export const NON_CODE = new Set([
  'Markdown', 'Text', 'JSON', 'YAML', 'TOML', 'XML', 'SVG', 'CSV', 'INI',
  'Rich Text Format', 'Roff', 'HTML',
]);

/**
 * Turn a { language: bytes } map into line estimates.
 * @returns {{ total:number, code:number, byLang:Array<{name,bytes,lines,pct,color}> }}
 */
export function estimateLines(langBytes) {
  const entries = Object.entries(langBytes || {});
  if (!entries.length) return { total: 0, code: 0, bytes: 0, byLang: [] };

  let total = 0, code = 0, totalBytes = 0;
  const byLang = entries.map(([name, b]) => {
    const lines = Math.round(b / (BYTES_PER_LINE[name] || 34));
    total += lines;
    totalBytes += b;
    if (!NON_CODE.has(name)) code += lines;
    return { name, bytes: b, lines, color: langColor(name), pct: 0 };
  });
  byLang.sort((a, b) => b.bytes - a.bytes);
  for (const l of byLang) l.pct = totalBytes ? (l.bytes / totalBytes) * 100 : 0;
  return { total, code, bytes: totalBytes, byLang };
}

/** Roll several repos' language maps into one portfolio-wide breakdown. */
export function aggregateLanguages(repos) {
  const sum = {};
  for (const r of repos) {
    for (const [name, b] of Object.entries(r.langBytes || {})) sum[name] = (sum[name] || 0) + b;
  }
  return estimateLines(sum);
}

/* ── Exact counting (opt-in, walks the tree) ──────────────────────── */

const COUNTABLE = /\.(js|jsx|mjs|cjs|ts|tsx|py|rb|go|rs|java|kt|kts|swift|c|h|cc|cpp|hpp|cs|php|sh|bash|zsh|ps1|lua|pl|r|scala|hs|ex|exs|erl|clj|ml|fs|jl|nim|zig|sol|m|mm|dart|vue|svelte|astro|css|scss|sass|less|styl|html|htm|sql|graphql|gql|proto|tf|hcl|yml|yaml|toml|json|md|txt|xml|vim|el|lisp|scm|f90|pas|groovy|gradle|cmake|mk|dockerfile|makefile)$/i;

const SKIP_DIR = /(^|\/)(node_modules|vendor|dist|build|out|\.next|\.nuxt|target|bin|obj|\.git|coverage|__pycache__|\.venv|venv|bower_components|third_party|Pods)(\/|$)/;

export const isCountable = (path, size) =>
  size > 0 && size < 900_000 && COUNTABLE.test(path) && !SKIP_DIR.test(path);

/** How many files a single exact count will read before it asks first. */
export const COUNT_CONFIRM_AT = 400;

export const countableFiles = (tree) =>
  (tree?.tree || []).filter((n) => n.type === 'blob' && isCountable(n.path, n.size));

/**
 * Count real lines by fetching every source blob in the tree.
 * Expensive — one API request per file. Reports progress through `onProgress`.
 * Responses are not cached: a big repo would otherwise fill the extension's
 * whole storage quota with blobs that are read exactly once.
 */
export async function countExact(gh, repo, tree, onProgress) {
  const files = countableFiles(tree);
  if (!files.length) return { lines: 0, files: 0, blank: 0, truncated: tree?.truncated || false };

  const { pool, decodeBase64 } = await import('./util.js');
  let lines = 0, blank = 0, done = 0;

  await pool(files, 6, async (f) => {
    const blob = await gh.blob(repo, f.sha, { noStore: true });
    if (!blob?.content) return;
    let text;
    try { text = decodeBase64(blob.content); } catch { return; }
    const rows = text.split('\n');
    if (rows[rows.length - 1] === '') rows.pop();
    lines += rows.length;
    blank += rows.filter((r) => !r.trim()).length;
  }, () => onProgress?.(++done, files.length));

  return { lines, files: files.length, blank, truncated: tree?.truncated || false };
}
