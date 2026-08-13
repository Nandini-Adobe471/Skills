#!/usr/bin/env node
/*
 * Emit the EXLM block-picker widget as a single, deterministic HTML string.
 *
 * The picker must look identical in every session, so it is NOT hand-written by the
 * model — this script renders it from a fixed template with the LIVE catalog injected.
 * The skill runs this and passes stdout straight to the visualization tool (show_widget)
 * as `widget_code`, verbatim.
 *
 * Usage:
 *   node render_picker.js            # first render (cached catalog, "click check for updates")
 *   node render_picker.js --checked  # after "Check for updates" (REFRESH + New/Updated tags)
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const checked = process.argv.includes('--checked');
const blocksJs = path.join(__dirname, 'blocks.js');

// Pull the live catalog from the engine (deterministic data source).
let cat;
try {
  const env = Object.assign({}, process.env, checked ? { REFRESH: '1' } : {});
  const args = checked ? ['catalog', '--json'] : ['catalog', '--peek', '--json'];
  cat = JSON.parse(execFileSync('node', [blocksJs, ...args], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  process.stderr.write(`render_picker: could not read catalog — ${e.message}\n`);
  process.exit(1);
}

// [title, id, group, tag]
const D = cat.blocks.map((b) => [b.title, b.id, b.group, b.tag || '']);

const widget = `<h2 class="sr-only">Searchable, paginated multi-select picker of all ${D.length} EXLM blocks; selection shown by a visible checkbox and a chip row.</h2>
<style>
.pk{padding:1rem 0}
.pk .wn{border:0.5px solid var(--border);border-radius:12px;padding:10px 12px 10px 14px;margin-bottom:14px;background:var(--surface-1);font-size:14px;display:flex;align-items:center;gap:12px}
.pk .sr{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.pk .chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 12px}
.pk .chips .lbl{font-size:13px;color:var(--text-secondary)}
.pk .chip{display:inline-flex;align-items:center;gap:5px;font-size:12px;padding:3px 8px 3px 10px;border-radius:14px;background:var(--bg-accent);color:var(--text-accent);cursor:pointer}
.pk .chip i{font-size:13px}
.pk table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:13px;border:0.5px solid var(--border);border-radius:12px;overflow:hidden}
.pk th,.pk td{padding:9px 10px;text-align:left;vertical-align:middle}
.pk thead tr{background:var(--surface-1);color:var(--text-secondary);font-size:12px}
.pk tbody tr{border-top:0.5px solid var(--border);cursor:pointer}
.pk tbody tr:hover td{background:var(--surface-1)}
.pk .c{width:34px;text-align:center}
.pk .bk{white-space:normal;word-break:break-word}
.pk .id{width:196px;font-family:var(--font-mono);font-size:12px;color:var(--text-accent);white-space:normal;word-break:break-word}
.pk .gp{width:118px;color:var(--text-muted);white-space:nowrap}
.pk .st{width:96px;white-space:nowrap}
.pk .ft{display:flex;align-items:center;justify-content:space-between;margin-top:12px;gap:12px}
.pk .pill{font-size:11px;padding:1px 8px;border-radius:10px}
.pk .btn{font-size:14px}
.pk .gen[disabled]{opacity:.45;cursor:default;border:0.5px solid var(--border);color:var(--text-muted)}
.pk .gen:not([disabled]){border:2px solid var(--border-accent);color:var(--text-accent)}
</style>
<div class="pk">
<div class="wn"><span id="wntext" style="flex:1"></span><button id="refresh" class="btn" style="display:inline-flex;align-items:center;gap:6px;white-space:nowrap"><i class="ti ti-refresh" aria-hidden="true"></i> Check for updates ↗</button></div>
<div class="sr"><i class="ti ti-search" style="font-size:18px;color:var(--text-muted)" aria-hidden="true"></i><input id="q" type="text" placeholder="Search blocks by name" style="flex:1" aria-label="Search blocks by name" /><span id="count" style="font-size:13px;color:var(--text-muted);min-width:72px;text-align:right"></span></div>
<div id="chips" class="chips" style="display:none"></div>
<table><thead><tr><th class="c"></th><th class="bk">Block</th><th class="id">ID</th><th class="gp">Group</th><th class="st">Status</th></tr></thead><tbody id="body"></tbody></table>
<div class="ft"><div style="display:flex;gap:8px"><button id="prev" class="btn"><i class="ti ti-chevron-left" aria-hidden="true"></i> Prev</button><button id="next" class="btn">Next <i class="ti ti-chevron-right" aria-hidden="true"></i></button></div><span id="pageinfo" style="font-size:13px;color:var(--text-secondary)"></span><button id="gen" class="btn gen" disabled>Generate</button></div>
</div>
<script>
const D=${JSON.stringify(D)};
const T=Object.fromEntries(D.map(b=>[b[1],b[0]]));
const CHECKED=${checked ? 'true' : 'false'};
const SIZE=10;let term="",page=1;const sel=new Set();
const body=document.getElementById('body'),cnt=document.getElementById('count'),info=document.getElementById('pageinfo'),gen=document.getElementById('gen'),chips=document.getElementById('chips');
function esc(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;')}
function filtered(){return D.filter(b=>term===""||b[0].toLowerCase().includes(term));}
function whatsnew(){const el=document.getElementById('wntext');
 if(!CHECKED){el.innerHTML='<span style="color:var(--text-secondary)"><i class="ti ti-info-circle" style="vertical-align:-2px" aria-hidden="true"></i> Showing the cached list ('+D.length+' blocks). Click <b>Check for updates</b> to pull the latest from EXLM.</span>';return;}
 const nw=D.filter(b=>b[3]==='NEW'),up=D.filter(b=>b[3]==='UPDATED');
 if(!nw.length&&!up.length){el.innerHTML='<span style="color:var(--text-secondary)"><i class="ti ti-circle-check" style="color:var(--text-success);vertical-align:-2px" aria-hidden="true"></i> Checked just now — no blocks are new or changed.</span>';return;}
 let h='<b>Checked just now —</b> ';if(nw.length)h+='<span style="color:var(--text-success)">'+nw.length+' new</span>';if(up.length)h+=(nw.length?' · ':'')+'<span style="color:var(--text-warning)">'+up.length+' updated</span>';el.innerHTML=h;}
function stat(t){if(t==='NEW')return '<span class="pill" style="background:var(--bg-success);color:var(--text-success)">New</span>';if(t==='UPDATED')return '<span class="pill" style="background:var(--bg-warning);color:var(--text-warning)">Updated</span>';return '<span style="font-size:12px;color:var(--text-muted)">No change</span>';}
function renderChips(){if(!sel.size){chips.style.display='none';chips.innerHTML='';return;}chips.style.display='flex';chips.innerHTML='<span class="lbl">Selected ('+sel.size+'):</span>'+[...sel].map(id=>'<span class="chip" data-id="'+id+'">'+esc(T[id]||id)+' <i class="ti ti-x" aria-hidden="true"></i></span>').join('');}
function syncGen(){const n=sel.size;gen.disabled=n===0;gen.textContent=n===0?'Generate':('Generate '+n+' guide'+(n===1?'':'s')+' ↗');}
function render(){const rows=filtered();const pages=Math.max(1,Math.ceil(rows.length/SIZE));if(page>pages)page=pages;
 const start=(page-1)*SIZE,slice=rows.slice(start,start+SIZE);
 cnt.textContent=rows.length+" block"+(rows.length===1?"":"s");
 body.innerHTML=slice.length?slice.map(b=>{const on=sel.has(b[1]);
  return '<tr data-id="'+b[1]+'" role="button" tabindex="0" aria-pressed="'+on+'"><td class="c"><i class="ti '+(on?'ti-square-check':'ti-square')+'" style="font-size:19px;color:'+(on?'var(--text-accent)':'var(--text-muted)')+'" aria-hidden="true"></i></td><td class="bk">'+esc(b[0])+'</td><td class="id">'+esc(b[1])+'</td><td class="gp">'+esc(b[2])+'</td><td class="st">'+stat(b[3])+'</td></tr>';}).join(''):'<tr><td colspan="5" style="padding:20px;color:var(--text-muted);text-align:center">No blocks match.</td></tr>';
 info.textContent="Page "+page+" of "+pages;renderChips();syncGen();}
function toggle(id){if(sel.has(id))sel.delete(id);else sel.add(id);render();}
body.addEventListener('click',e=>{const r=e.target.closest('tr[data-id]');if(r)toggle(r.dataset.id);});
body.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();const r=e.target.closest('tr[data-id]');if(r)toggle(r.dataset.id);}});
chips.addEventListener('click',e=>{const c=e.target.closest('.chip');if(c)toggle(c.dataset.id);});
document.getElementById('q').addEventListener('input',e=>{term=e.target.value.toLowerCase().trim();page=1;render();});
document.getElementById('prev').addEventListener('click',()=>{if(page>1){page--;render();}});
document.getElementById('next').addEventListener('click',()=>{const pages=Math.max(1,Math.ceil(filtered().length/SIZE));if(page<pages){page++;render();}});
document.getElementById('refresh').addEventListener('click',()=>{sel.clear();render();sendPrompt("check for updates");});
gen.addEventListener('click',()=>{const ids=[...sel];if(!ids.length)return;sendPrompt("document the "+ids.join(', ')+" block"+(ids.length>1?"s":"")+" as markdown and Word");});
whatsnew();render();
</script>`;

process.stdout.write(widget);
