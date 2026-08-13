#!/usr/bin/env node
/*
 * Convert a Markdown authoring guide into a Word .docx — with NO external
 * dependencies. It assembles the OOXML package (a ZIP of XML parts) directly,
 * so it runs anywhere Node runs, offline, without `npm install`.
 *
 * It understands the constrained Markdown subset the authoring-guide template
 * produces:
 *   - Headings:      #, ##, ###, #### (also ##### / ######)
 *   - Paragraphs:    blank-line separated
 *   - Bullet lists:  lines starting with "- " or "* "
 *   - Pipe tables:   | col | col |  with a | --- | --- | separator row
 *   - Horizontal rule: a line of --- (rendered as spacing)
 *   - Inline:        **bold**, *italic* / _italic_, `code`, [text](url)
 *
 * Usage:
 *   node build_docx.js --in guide.md --out guide.docx [--title "Optional title"]
 */
'use strict';
const fs = require('fs');
const zlib = require('zlib');

/* ----------------------------- XML helpers ----------------------------- */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* --------------------------- Inline parsing ---------------------------- */
// Turn a line of Markdown into an array of runs: {text, bold, italic, code}.
// Links [text](url) render as their text plus the url in parentheses so the
// destination isn't lost in a printed guide.
function parseInline(text) {
  const runs = [];
  let i = 0;
  const push = (t, opts) => { if (t) runs.push(Object.assign({ text: t, bold: false, italic: false, code: false }, opts)); };
  const src = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, label, url) => `${label} (${url})`);
  while (i < src.length) {
    if (src.startsWith('**', i)) {
      const end = src.indexOf('**', i + 2);
      if (end !== -1) { push(src.slice(i + 2, end), { bold: true }); i = end + 2; continue; }
    }
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) { push(src.slice(i + 1, end), { code: true }); i = end + 1; continue; }
    }
    if ((src[i] === '*' || src[i] === '_') && src[i + 1] !== ' ') {
      const marker = src[i];
      const end = src.indexOf(marker, i + 1);
      if (end !== -1) { push(src.slice(i + 1, end), { italic: true }); i = end + 1; continue; }
    }
    // accumulate a plain chunk until the next possible marker
    let j = i + 1;
    while (j < src.length && !'*_`'.includes(src[j]) && !src.startsWith('**', j)) j += 1;
    push(src.slice(i, j), {});
    i = j;
  }
  return runs.length ? runs : [{ text: '', bold: false, italic: false, code: false }];
}

function runXml(run) {
  const rpr = [];
  if (run.bold) rpr.push('<w:b/>');
  if (run.italic) rpr.push('<w:i/>');
  if (run.code) rpr.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>', '<w:color w:val="B03060"/>');
  const rprXml = rpr.length ? `<w:rPr>${rpr.join('')}</w:rPr>` : '';
  return `<w:r>${rprXml}<w:t xml:space="preserve">${esc(run.text)}</w:t></w:r>`;
}

/* ----------------------- Paragraph / block XML ------------------------- */
const HEADING_SIZE = { 1: 36, 2: 30, 3: 26, 4: 23, 5: 21, 6: 20 }; // half-points

function headingXml(level, text) {
  const sz = HEADING_SIZE[level] || 22;
  const runs = parseInline(text).map((r) => {
    const rpr = ['<w:b/>', `<w:sz w:val="${sz}"/>`, '<w:color w:val="1B1B1B"/>'];
    if (r.italic) rpr.push('<w:i/>');
    return `<w:r><w:rPr>${rpr.join('')}</w:rPr><w:t xml:space="preserve">${esc(r.text)}</w:t></w:r>`;
  }).join('');
  return `<w:p><w:pPr><w:spacing w:before="${level <= 2 ? 240 : 160}" w:after="80"/>`
    + `<w:outlineLvl w:val="${level - 1}"/></w:pPr>${runs}</w:p>`;
}

function paragraphXml(text) {
  const runs = parseInline(text).map(runXml).join('');
  return `<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${runs}</w:p>`;
}

function bulletXml(text) {
  // Simple, reliable bullet without a numbering part: a bullet glyph + tab.
  const runs = [runXml({ text: '•\t', bold: false, italic: false, code: false })]
    .concat(parseInline(text).map(runXml)).join('');
  return `<w:p><w:pPr><w:ind w:left="360" w:hanging="360"/><w:spacing w:after="60"/></w:pPr>${runs}</w:p>`;
}

function cellXml(text, isHeader) {
  const runs = parseInline(text).map((r) => runXml(Object.assign({}, r, { bold: r.bold || isHeader }))).join('');
  const shd = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${shd}</w:tcPr>`
    + `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runs}</w:p></w:tc>`;
}

function tableXml(rows) {
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
    .map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>`).join('');
  const body = rows.map((cells, idx) => {
    const tcs = cells.map((c) => cellXml(c, idx === 0)).join('');
    return `<w:tr>${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>`
    + `<w:tblBorders>${borders}</w:tblBorders>`
    + `<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>`
    + `</w:tblPr>${body}</w:tbl>`;
}

/* --------------------------- Markdown parse ---------------------------- */
function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
}
function splitRow(line) {
  let l = line.trim();
  if (l.startsWith('|')) l = l.slice(1);
  if (l.endsWith('|')) l = l.slice(0, -1);
  return l.split('|').map((c) => c.trim());
}

function mdToBlocks(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'p', text: para.join(' ') }); para = []; }
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    // fenced code block: emit each line as monospace paragraphs
    if (trimmed.startsWith('```')) {
      flushPara();
      i += 1;
      const code = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i += 1; }
      for (const c of code) blocks.push({ type: 'code', text: c });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) { flushPara(); blocks.push({ type: 'h', level: heading[1].length, text: heading[2] }); continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { flushPara(); blocks.push({ type: 'hr' }); continue; }

    if (/^[-*]\s+/.test(trimmed)) { flushPara(); blocks.push({ type: 'li', text: trimmed.replace(/^[-*]\s+/, '') }); continue; }

    // table: a row containing a pipe, followed by a separator row
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushPara();
      const rows = [splitRow(trimmed)];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitRow(lines[i])); i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', rows });
      continue;
    }

    if (trimmed === '') { flushPara(); continue; }
    para.push(trimmed);
  }
  flushPara();
  return blocks;
}

function blocksToBodyXml(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'h') out.push(headingXml(b.level, b.text));
    else if (b.type === 'p') out.push(paragraphXml(b.text));
    else if (b.type === 'li') out.push(bulletXml(b.text));
    else if (b.type === 'table') out.push(tableXml(b.rows));
    else if (b.type === 'hr') out.push('<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="CCCCCC"/></w:pBdr></w:pPr></w:p>');
    else if (b.type === 'code') {
      out.push(`<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>`
        + `<w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr>`
        + `<w:t xml:space="preserve">${esc(b.text)}</w:t></w:r></w:p>`);
    }
  }
  return out.join('');
}

/* ------------------------------ Package -------------------------------- */
function documentXml(bodyXml) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">`
    + `<w:body>${bodyXml}`
    + `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>`
    + `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>`
    + `</w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  + `<Default Extension="xml" ContentType="application/xml"/>`
  + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  + `</Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
  + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>`
  + `</Relationships>`;

/* --------------------------- Minimal ZIP ------------------------------- */
// CRC32
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  // files: [{name, data(Buffer)}]. Deflate each with raw deflate (method 8).
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.from(f.data);
    const comp = zlib.deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(f.name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(8, 8);           // method: deflate
    local.writeUInt16LE(0, 10);          // mod time
    local.writeUInt16LE(0x21, 12);       // mod date (arbitrary valid)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, comp);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);            // version made by
    cen.writeUInt16LE(20, 6);            // version needed
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const centralOffset = offset;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

/* ------------------------------- Main ---------------------------------- */
function parseArgs(argv) {
  const args = { in: null, out: null, title: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--in') args.in = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--title') args.title = argv[++i];
    else { process.stderr.write(`unknown arg: ${argv[i]}\n`); process.exit(2); }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.in || !args.out) { process.stderr.write('usage: node build_docx.js --in guide.md --out guide.docx [--title "..."]\n'); process.exit(2); }
  let md = fs.readFileSync(args.in, 'utf8');
  if (args.title) md = `# ${args.title}\n\n${md}`;
  const blocks = mdToBlocks(md);
  const bodyXml = blocksToBodyXml(blocks);
  const docXml = documentXml(bodyXml);
  const buf = zip([
    { name: '[Content_Types].xml', data: CONTENT_TYPES },
    { name: '_rels/.rels', data: RELS },
    { name: 'word/document.xml', data: docXml },
  ]);
  fs.writeFileSync(args.out, buf);
  process.stdout.write(`wrote ${args.out} (${buf.length} bytes, ${blocks.length} blocks)\n`);
}

main();
