#!/usr/bin/env node
/*
 * Data engine for the eds-block-guide skill.
 *
 * Joins an Adobe EDS / Universal Editor project's authoring config
 * (component-models.json + component-definition.json + component-filters.json) plus
 * per-block source (blocks/<id>/<id>.js|css) into a normalized "block spec".
 * Zero external dependencies.
 *
 * SOURCE: defaults to the Adobe Experience League "exlm" project live from GitHub —
 * no local checkout needed. Override with --repo:
 *   --repo <local-path>                     a checked-out EDS project
 *   --repo https://github.com/<org>/<repo>  a GitHub repo (optionally .../tree/<branch>)
 *   --repo https://raw.githubusercontent.com/<org>/<repo>/<branch>/
 * Remote reads are cached under ~/.eds-block-guide/cache/, and reused if the network
 * is unavailable on a later run.
 *
 * Modes:
 *   node blocks.js [--repo <src>] catalog [--json] [--peek]
 *   node blocks.js [--repo <src>] list
 *   node blocks.js [--repo <src>] show <id> [<id> ...] [--out spec.json]
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_REPO = { org: 'adobe-experience-league', repo: 'exlm', branch: 'main' };

const FIELD_WIDGETS = {
  text: 'Plain text field (single line)',
  richtext: 'Rich text editor (bold, italic, links, lists)',
  textarea: 'Multi-line plain text field',
  select: 'Dropdown — pick one option',
  multiselect: 'Multi-select — pick one or more options',
  reference: 'Asset picker (image/file from DAM)',
  'aem-content': 'Content picker (link to a page or fragment)',
  boolean: 'Toggle / checkbox (on or off)',
  'radio-group': 'Radio buttons — pick one',
  'date-time': 'Date & time picker',
  'custom-aem-tag': 'Tag picker (AEM taxonomy tags)',
  number: 'Number field',
  container: 'Field group / container',
};

const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);

/* ---------------------------- source resolution ---------------------------- */
function remoteFrom(org, repo, branch) {
  const base = `https://raw.githubusercontent.com/${org}/${repo}/${branch}/`;
  return { kind: 'remote', base, key: hash(base), label: `${org}/${repo}@${branch}` };
}
function normalizeRepo(arg) {
  if (!arg) return remoteFrom(DEFAULT_REPO.org, DEFAULT_REPO.repo, DEFAULT_REPO.branch);
  if (/^https?:\/\//i.test(arg)) {
    let m = arg.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+))?\/?$/i);
    if (m) return remoteFrom(m[1], m[2], m[3] || 'main');
    m = arg.match(/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)/i);
    if (m) return remoteFrom(m[1], m[2], m[3]);
    const base = arg.endsWith('/') ? arg : `${arg}/`;
    return { kind: 'remote', base, key: hash(base), label: base };
  }
  const base = path.resolve(arg);
  return { kind: 'local', base, key: hash(base), label: base };
}
function cacheDir(src) { return path.join(os.homedir(), '.eds-block-guide', 'cache', src.key); }

// Read a repo-relative file as text. Remote reads are CACHE-FIRST: if a cached copy
// exists we return it immediately (fast, offline-friendly) and only hit the network
// when the cache is missing or the caller passes REFRESH=1. Set REFRESH=1 in the env
// (or delete ~/.eds-block-guide/cache) to force a fresh pull from GitHub.
async function readRel(src, rel, { optional = false, refresh = false } = {}) {
  if (src.kind === 'local') {
    const p = path.join(src.base, rel);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    if (optional) return null;
    throw new Error(`missing file: ${p}`);
  }
  const url = src.base + rel;
  const cacheFile = path.join(cacheDir(src), rel);
  const wantFresh = refresh || process.env.REFRESH === '1';
  if (!wantFresh && fs.existsSync(cacheFile)) {
    return fs.readFileSync(cacheFile, 'utf8');
  }
  try {
    const res = await fetch(url);
    if (res.status === 404) { if (optional) return null; const e = new Error(`404 ${url}`); e.status = 404; throw e; }
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const txt = await res.text();
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, txt);
    return txt;
  } catch (e) {
    if (e.status === 404) { if (optional) return null; throw e; }
    if (fs.existsSync(cacheFile)) { process.stderr.write(`(offline) using cached ${rel}\n`); return fs.readFileSync(cacheFile, 'utf8'); }
    if (optional) return null;
    throw new Error(`could not read ${rel} from ${src.label}: ${e.message}`);
  }
}
async function readJson(src, rel, opts) { const t = await readRel(src, rel, opts); return t == null ? null : JSON.parse(t); }

/* ------------------------------ normalization ------------------------------ */
function flattenOptions(options) {
  const flat = [];
  for (const opt of options || []) {
    if (opt.children) for (const c of opt.children) flat.push({ label: c.name || '', value: c.value || '', group: opt.name || '' });
    else flat.push({ label: opt.name || '', value: opt.value || '', group: '' });
  }
  return flat;
}

// Turn a JsonLogic-style `condition` into a plain "shown only when …" phrase.
function humanizeCondition(cond, labelOf) {
  if (cond == null || typeof cond !== 'object') return '';
  const op = Object.keys(cond)[0];
  const args = cond[op];
  const nameToLabel = (n) => (n === '' || n == null ? 'each value' : (labelOf(n) || n));
  const val = (x) => {
    if (x && typeof x === 'object' && 'var' in x) return nameToLabel(x.var);
    if (Array.isArray(x)) return x.map(val).join(', ');
    if (x === '') return 'empty';
    return `"${x}"`;
  };
  switch (op) {
    case '===': return `${val(args[0])} is ${val(args[1])}`;
    case '!==': return `${val(args[0])} is not ${val(args[1])}`;
    case '>': return `${val(args[0])} is greater than ${val(args[1])}`;
    case '<': return `${val(args[0])} is less than ${val(args[1])}`;
    case 'in': return `${val(args[0])} is one of [${val(args[1])}]`;
    case 'some': {
      const coll = val(args[0]);
      const inner = args[1] && args[1].in ? `[${val(args[1].in[1])}]` : humanizeCondition(args[1], labelOf);
      return `${coll} includes one of ${inner}`;
    }
    case 'and': return args.map((a) => humanizeCondition(a, labelOf)).filter(Boolean).join(' AND ');
    case 'or': return args.map((a) => humanizeCondition(a, labelOf)).filter(Boolean).join(' OR ');
    case '!': return `NOT (${humanizeCondition(args, labelOf)})`;
    default: return JSON.stringify(cond);
  }
}

function normalizeField(field, labelOf) {
  const comp = field.component || '';
  return {
    name: field.name || '',
    label: field.label || '',
    description: field.description || '',
    component: comp,
    widget: FIELD_WIDGETS[comp] || comp,
    valueType: field.valueType || '',
    required: !!field.required,
    hidden: !!field.hidden,
    readOnly: !!field.readOnly,
    placeholder: field.placeholder || '',
    default: field.value != null ? field.value : '',
    multi: field.multi != null ? field.multi : null,
    maxSize: field.maxSize != null ? field.maxSize : null,
    options: flattenOptions(field.options),
    condition: field.condition || null,
    conditionText: field.condition ? humanizeCondition(field.condition, labelOf) : '',
  };
}

const findModel = (models, id) => (models || []).find((m) => m.id === id) || null;

function findDefinition(definition, id) {
  for (const group of (definition && definition.groups) || []) {
    for (const comp of group.components || []) {
      if (comp.id === id) {
        const xwalk = (((comp.plugins || {}).xwalk || {}).page) || {};
        return { title: comp.title || id, group: group.title || '', resourceType: xwalk.resourceType || '', template: xwalk.template || {} };
      }
    }
  }
  return null;
}

function findPlacements(filters, id) {
  const canBePlacedIn = []; let canContain = [];
  for (const f of filters || []) {
    const comps = f.components || [];
    if (comps.includes(id)) canBePlacedIn.push(f.id);
    if (f.id === id) canContain = comps;
  }
  return { can_be_placed_in: canBePlacedIn, can_contain: canContain };
}

async function readSource(src, id, fresh = false) {
  const out = {};
  for (const ext of ['js', 'css']) {
    const rel = `blocks/${id}/${id}.${ext}`;
    const content = await readRel(src, rel, { optional: true, refresh: fresh });
    out[ext] = content == null ? null : { path: rel, content };
  }
  return out;
}

async function buildSpec(src, models, definition, filters, id, fresh = false) {
  const model = findModel(models, id);
  const rawFields = (model && model.fields) || [];
  const labelOf = (name) => { const f = rawFields.find((x) => x.name === name); return f ? (f.label || name) : null; };
  const fields = rawFields.map((f) => normalizeField(f, labelOf));
  let variants = null; const contentFields = [];
  for (const f of fields) { if (f.name === 'classes') variants = f; else contentFields.push(f); }
  const source = await readSource(src, id, fresh);
  return {
    id,
    has_model: model != null,
    definition: findDefinition(definition, id),
    placements: findPlacements(filters, id),
    content_fields: contentFields,
    variants,
    source,
    has_conditional_fields: contentFields.some((f) => f.conditionText),
  };
}

function listBlocks(models, definition) {
  const ids = new Set();
  for (const m of models || []) if (m.id) ids.add(m.id);
  for (const g of (definition && definition.groups) || []) for (const c of g.components || []) if (c.id) ids.add(c.id);
  return [...ids].sort();
}

/* ------------------------------ fuzzy suggest ------------------------------ */
function levenshtein(a, b) {
  const m = a.length; const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) for (let j = 1; j <= n; j += 1) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}
function suggest(query, all) {
  const q = query.toLowerCase().replace(/\s+/g, '-');
  return all
    .map((id) => ({ id, sub: id.toLowerCase().includes(q) || q.includes(id.toLowerCase()), dist: levenshtein(q, id.toLowerCase()) }))
    .sort((a, b) => (b.sub - a.sub) || (a.dist - b.dist))
    .filter((x) => x.sub || x.dist <= Math.max(3, Math.floor(q.length / 2)))
    .slice(0, 5)
    .map((x) => x.id);
}

/* ------------------------------ change tracking ---------------------------- */
function snapshotPath(src) {
  const dir = path.join(os.homedir(), '.eds-block-guide');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `snapshot-${src.key}.json`);
}
function blockHash(models, definition, id) {
  const model = findModel(models, id);
  const def = findDefinition(definition, id);
  return crypto.createHash('sha1')
    .update(JSON.stringify({ f: (model && model.fields) || [], t: def && def.title, g: def && def.group }))
    .digest('hex');
}
function catalog(src, models, definition, filters, { peek }) {
  const ids = listBlocks(models, definition);
  const snapFile = snapshotPath(src);
  const prev = (fs.existsSync(snapFile) && JSON.parse(fs.readFileSync(snapFile, 'utf8'))) || {};
  const firstRun = Object.keys(prev).length === 0;
  const now = {};
  const rows = ids.map((id) => {
    const h = blockHash(models, definition, id); now[id] = h;
    const def = findDefinition(definition, id);
    let tag = '';
    if (!firstRun) { if (!(id in prev)) tag = 'NEW'; else if (prev[id] !== h) tag = 'UPDATED'; }
    return { id, title: (def && def.title) || id, group: (def && def.group) || '—', tag };
  });
  const rank = (t) => (t === 'NEW' ? 0 : t === 'UPDATED' ? 1 : 2);
  const ordered = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.tag) - rank(b.r.tag) || b.i - a.i).map((x) => x.r);
  if (!peek) fs.writeFileSync(snapFile, JSON.stringify(now));
  return { first_run: firstRun, count: rows.length, blocks: ordered, snapshot: snapFile, source: src.label };
}

/* ----------------------------------- CLI ----------------------------------- */
function parse(argv) {
  const a = { repo: null, mode: null, ids: [], json: false, peek: false, out: null, fresh: false };
  for (let i = 2; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--repo') a.repo = argv[++i];
    else if (t === '--json') a.json = true;
    else if (t === '--peek') a.peek = true;
    else if (t === '--fresh') a.fresh = true;
    else if (t === '--out') a.out = argv[++i];
    else if (!a.mode && ['catalog', 'list', 'show', 'warm'].includes(t)) a.mode = t;
    else a.ids.push(t);
  }
  return a;
}

async function main() {
  const a = parse(process.argv);
  if (!a.mode) { process.stderr.write('usage: node blocks.js [--repo <path|url>] <catalog|list|show> [ids...] [--json] [--peek] [--out f]\n'); process.exit(2); }
  const src = normalizeRepo(a.repo);
  // `warm` force-refreshes the shared config JSON into cache (run in the background at
  // launch) so later `show` reads the latest models/definition/filters instantly.
  const wantRefresh = a.mode === 'warm';
  let models; let definition; let filters;
  try {
    models = await readJson(src, 'component-models.json', { optional: true, refresh: wantRefresh });
    definition = await readJson(src, 'component-definition.json', { optional: true, refresh: wantRefresh });
    filters = await readJson(src, 'component-filters.json', { optional: true, refresh: wantRefresh });
  } catch (e) { process.stderr.write(`error: ${e.message}\n`); process.exit(1); }
  if (a.mode === 'warm') { process.stdout.write(`warmed ${src.label} config cache\n`); return; }
  if (models == null && definition == null) {
    process.stderr.write(`error: no component-models.json / component-definition.json at ${src.label}. Check the --repo path/URL.\n`);
    process.exit(1);
  }
  const all = listBlocks(models, definition);

  if (a.mode === 'list') { all.forEach((id) => process.stdout.write(`${id}\n`)); return; }

  if (a.mode === 'catalog') {
    const cat = catalog(src, models, definition, filters, { peek: a.peek });
    if (a.json) { process.stdout.write(`${JSON.stringify(cat, null, 2)}\n`); return; }
    const news = cat.blocks.filter((b) => b.tag === 'NEW').length;
    const upd = cat.blocks.filter((b) => b.tag === 'UPDATED').length;
    process.stdout.write(`Source: ${cat.source}\n`);
    process.stdout.write(cat.first_run
      ? `${cat.count} blocks (first run for this source — no change history yet; ordered newest-file-first).\n\n`
      : `${cat.count} blocks — ${news} new, ${upd} changed since you last looked.\n\n`);
    // Neat, stacked Markdown table — renders cleanly wherever it's shown.
    process.stdout.write('| # | Block | ID | Group | Status |\n');
    process.stdout.write('| ---: | --- | --- | --- | --- |\n');
    cat.blocks.forEach((b, i) => process.stdout.write(`| ${i + 1} | ${b.title} | \`${b.id}\` | ${b.group} | ${b.tag || ''} |\n`));
    return;
  }

  if (!a.ids.length) { process.stderr.write('error: show needs at least one block id\n'); process.exit(2); }
  const specs = [];
  for (const id of a.ids) {
    if (!all.includes(id)) specs.push({ id, found: false, suggestions: suggest(id, all) });
    else specs.push(Object.assign({ found: true }, await buildSpec(src, models, definition, filters, id, a.fresh)));
  }
  const payload = JSON.stringify(specs, null, 2);
  if (a.out) { fs.writeFileSync(a.out, payload); process.stdout.write(`wrote ${a.out}\n`); }
  else process.stdout.write(`${payload}\n`);
  specs.filter((s) => s.found === false).forEach((s) => {
    process.stderr.write(`warning: no block "${s.id}". Did you mean: ${s.suggestions.join(', ') || '(no close matches)'}?\n`);
  });
}

main().catch((e) => { process.stderr.write(`error: ${e.message}\n`); process.exit(1); });
