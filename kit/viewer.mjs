// page.html: the page viewer. It shows the page alone by default; its edit mode
// lets the reader drag a rectangle over the page and copy a rework instruction
// naming the panel and the parts under it. One self-contained file: the page
// SVG, the map JSON and the source of viewer-core.mjs are inlined, because the
// page is opened from file:// where nothing can be fetched.
import { readFileSync } from 'node:fs';

const CORE = readFileSync(new URL('./viewer-core.mjs', import.meta.url), 'utf8').replace(/^export\s+/gm, '');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CSS = `
:root{--ink:#16181d;--muted:#5b616e;--line:#d5d7dc;--bg:#ebecee;--panel:#fff;--accent:#1a56db;--accent-soft:rgba(26,86,219,.14);--side:420px}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{display:flex;flex-direction:column}
.bar{flex:none;height:48px;display:flex;align-items:center;gap:12px;padding:0 16px;background:var(--bg);border-bottom:1px solid var(--line)}
.bar h1{margin:0;font-size:14px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
button{font:inherit;color:inherit;cursor:pointer;border:1px solid #b9bcc4;background:#fff;border-radius:6px;padding:5px 12px}
button:hover{border-color:#8d929c}
button:focus-visible,textarea:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.stage{flex:1;min-height:0;overflow:auto;padding:20px 16px 40px}
.page{position:relative;margin:0 auto;width:min(100%,var(--pw));box-shadow:0 1px 3px rgba(0,0,0,.18)}
.page>svg{display:block;width:100%;height:auto}
.page>svg.ov{position:absolute;inset:0;height:100%;pointer-events:none}
body.editing .stage{padding-right:calc(var(--side) + 32px)}
body.editing .page{cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none}
.side{position:fixed;top:64px;right:16px;max-height:calc(100vh - 80px);width:var(--side);overflow:auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:14px;transition:opacity .12s ease-out}
.side[hidden]{display:none}
.side.fade{opacity:0}
.info{display:flex;flex-direction:column;gap:14px}
.info[hidden]{display:none}
.side h2{margin:0;font-size:13px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.hint{margin:0;color:var(--muted)}
.where{margin:0;font-weight:600}
.where span{font-weight:400;color:var(--muted)}
ol.parts{list-style:none;margin:0;padding:0;display:grid;gap:4px}
ol.parts li{display:grid;grid-template-columns:1fr auto;gap:2px 10px;font-size:13px}
ol.parts .n{overflow-wrap:anywhere}
ol.parts .s{color:var(--muted);font-variant-numeric:tabular-nums}
ol.parts .b{grid-column:1/-1;height:3px;background:#eceef1;border-radius:2px;overflow:hidden}
ol.parts .b i{display:block;height:100%;background:var(--accent)}
label{display:block;font-weight:600;margin-bottom:6px}
textarea{width:100%;min-height:72px;resize:vertical;font:inherit;color:inherit;border:1px solid #b9bcc4;border-radius:6px;padding:7px 9px}
pre{margin:0;padding:10px 12px;background:#f4f5f7;border:1px solid var(--line);border-radius:6px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.row .primary{background:var(--accent);border-color:var(--accent);color:#fff}
.row .primary:disabled{opacity:.45;cursor:default}
.status{color:var(--muted);font-size:13px}
@media (max-width:860px){body.editing .stage{padding-right:16px;padding-bottom:calc(46vh + 24px)}.side{top:auto;bottom:16px;left:16px;width:auto;height:46vh}}
@media (prefers-reduced-motion:reduce){.side{transition:none}}
`;

// The browser side. Plain script, no template literals (it lives in one).
const CLIENT = `
(function () {
  var data = JSON.parse(document.getElementById('mk-data').textContent);
  var map = data.map, PW = map.size[0], PH = map.size[1];
  var body = document.body, page = document.getElementById('page');
  var art = page.querySelector('svg'), ov = document.getElementById('ov');
  var toggle = document.getElementById('edit'), side = document.getElementById('side');
  var hint = document.getElementById('hint'), info = document.getElementById('info');
  var where = document.getElementById('where'), list = document.getElementById('parts');
  var req = document.getElementById('req'), pre = document.getElementById('out');
  var copy = document.getElementById('copy'), clear = document.getElementById('clear'), status = document.getElementById('status');
  var panelEl = document.getElementById('ov-panel'), dimEl = document.getElementById('ov-dim'), selEl = document.getElementById('ov-sel'), selHalo = document.getElementById('ov-halo');
  var sel = null, hit = null, drag = null;

  function setRect(el, r) {
    el.setAttribute('x', r[0]); el.setAttribute('y', r[1]);
    el.setAttribute('width', r[2]); el.setAttribute('height', r[3]);
    el.style.display = '';
  }
  function hide(el) { el.style.display = 'none'; }
  function toPage(e) {
    var b = art.getBoundingClientRect();
    var x = (e.clientX - b.left) / b.width * PW, y = (e.clientY - b.top) / b.height * PH;
    return [Math.max(0, Math.min(PW, x)), Math.max(0, Math.min(PH, y))];
  }
  function rectOf(a, b) {
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])];
  }
  function instruction() {
    return formatInstruction({ pageFile: data.pageFile, panel: hit.panel, region: hit.region, parts: hit.parts, request: req.value });
  }
  function render() {
    status.textContent = '';
    if (!sel) {
      hide(selEl); hide(selHalo); hide(panelEl); hide(dimEl);
      hint.hidden = false; info.hidden = true;
      return;
    }
    setRect(selEl, sel); setRect(selHalo, sel);
    hint.hidden = true; info.hidden = false;
    var p = null;
    for (var i = 0; i < map.panels.length; i++) if (map.panels[i].id === hit.panel) p = map.panels[i];
    if (p) {
      setRect(panelEl, p.rect);
      var r = p.rect;
      var box = function (q) { return 'M' + q[0] + ' ' + q[1] + 'v' + q[3] + 'h' + q[2] + 'v' + (-q[3]) + 'Z'; };
      var d = 'M0 0H' + PW + 'V' + PH + 'H0Z' + box(r);
      // Insets lying on the selected panel stay dimmed (even-odd fills them again).
      map.panels.forEach(function (o) {
        var q = o.rect;
        if (o !== p && q[0] >= r[0] && q[1] >= r[1] && q[0] + q[2] <= r[0] + r[2] && q[1] + q[3] <= r[1] + r[3]) d += box(q);
      });
      dimEl.setAttribute('d', d);
      dimEl.style.display = '';
    } else { hide(panelEl); hide(dimEl); }
    if (!hit.panel) {
      where.textContent = 'No panel under the selection.';
      list.textContent = ''; pre.textContent = ''; copy.disabled = true;
      return;
    }
    where.innerHTML = '';
    where.appendChild(document.createTextNode('Panel ' + hit.panel + ' '));
    var s = document.createElement('span');
    s.textContent = '[' + hit.region.map(function (v) { return v.toFixed(2); }).join(', ') + ']';
    where.appendChild(s);
    list.textContent = '';
    if (!hit.parts.length) {
      var li0 = document.createElement('li'); li0.className = 'n'; li0.textContent = 'Background only';
      list.appendChild(li0);
    }
    hit.parts.forEach(function (q) {
      var li = document.createElement('li');
      var n = document.createElement('span'); n.className = 'n'; n.textContent = q.name;
      var v = document.createElement('span'); v.className = 's'; v.textContent = q.share + '%';
      var b = document.createElement('span'); b.className = 'b';
      var fill = document.createElement('i'); fill.style.width = q.share + '%'; b.appendChild(fill);
      li.appendChild(n); li.appendChild(v); li.appendChild(b);
      list.appendChild(li);
    });
    pre.textContent = instruction();
    copy.disabled = false;
  }
  function select(r) {
    sel = r; hit = r ? partsInRect(map, r) : null;
    render();
  }
  function setEditing(on) {
    body.classList.toggle('editing', on);
    toggle.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on) {
      side.hidden = false; side.classList.add('fade');
      requestAnimationFrame(function () { side.classList.remove('fade'); });
    } else { side.hidden = true; select(null); }
  }

  toggle.addEventListener('click', function () { setEditing(!body.classList.contains('editing')); });
  page.addEventListener('pointerdown', function (e) {
    if (!body.classList.contains('editing') || e.button !== 0) return;
    e.preventDefault();
    page.setPointerCapture(e.pointerId);
    drag = { a: toPage(e), id: e.pointerId };
  });
  page.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    var r = rectOf(drag.a, toPage(e));
    setRect(selEl, r); setRect(selHalo, r);
  });
  function end(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var r = rectOf(drag.a, toPage(e));
    drag = null;
    if (r[2] < 4 || r[3] < 4) { render(); return; }
    select(r);
  }
  page.addEventListener('pointerup', end);
  page.addEventListener('pointercancel', function () { drag = null; render(); });
  req.addEventListener('input', function () { if (hit && hit.panel) { pre.textContent = instruction(); status.textContent = ''; } });
  clear.addEventListener('click', function () { select(null); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && body.classList.contains('editing')) { drag = null; select(null); }
  });
  copy.addEventListener('click', function () {
    var text = pre.textContent;
    function fallback() {
      var range = document.createRange(); range.selectNodeContents(pre);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
      status.textContent = 'Selected. Press Ctrl+C to copy.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { status.textContent = 'Copied.'; }, fallback);
    } else fallback();
  });

  // Deep link: #select=x,y,w,h&request=... (page pixels).
  var q = new URLSearchParams(location.hash.slice(1));
  var raw = q.get('select');
  if (raw) {
    var r = raw.split(',').map(Number);
    if (r.length === 4 && r.every(isFinite) && r[2] > 0 && r[3] > 0) {
      setEditing(true);
      req.value = q.get('request') || '';
      select(r);
      var stage = document.getElementById('stage'), b = art.getBoundingClientRect(), s0 = stage.getBoundingClientRect();
      var mid = b.top - s0.top + stage.scrollTop + (r[1] + r[3] / 2) * (b.height / PH);
      stage.scrollTop = Math.max(0, mid - stage.clientHeight / 2);
    }
  }
})();
`;

/**
 * The viewer page for a built page: { svg, map, pageFile, title }. pageFile is
 * the page file named in the copied instruction (defaults to page.mjs).
 */
export function viewerHtml({ svg, map, pageFile = null, title = 'mangaka page' }) {
  const [PW, PH] = map.size;
  const data = JSON.stringify({ pageFile: pageFile || 'page.mjs', map }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
    `<style>${CSS.trim()}</style></head>` +
    `<body style="--pw:${PW}px">` +
    `<header class="bar"><h1>${esc(title)}</h1><button type="button" id="edit" aria-pressed="false">Edit region</button></header>` +
    `<main class="stage" id="stage"><div class="page" id="page">${svg}` +
    `<svg class="ov" id="ov" viewBox="0 0 ${PW} ${PH}" preserveAspectRatio="none" aria-hidden="true">` +
    `<path id="ov-dim" fill="rgba(20,22,28,.28)" fill-rule="evenodd" style="display:none"/>` +
    `<rect id="ov-panel" fill="none" stroke="#1a56db" stroke-width="2" stroke-dasharray="7 5" vector-effect="non-scaling-stroke" style="display:none"/>` +
    `<rect id="ov-halo" fill="none" stroke="#fff" stroke-width="5" vector-effect="non-scaling-stroke" style="display:none"/>` +
    `<rect id="ov-sel" fill="rgba(26,86,219,.14)" stroke="#1a56db" stroke-width="2" vector-effect="non-scaling-stroke" style="display:none"/>` +
    `</svg></div></main>` +
    `<aside class="side" id="side" hidden aria-label="Region rework">` +
    `<h2>Region</h2>` +
    `<p class="hint" id="hint">Drag over the page to select a region. Esc clears it.</p>` +
    `<div class="info" id="info" hidden><p class="where" id="where"></p>` +
    `<div><h2>Parts under the selection</h2><ol class="parts" id="parts" style="margin-top:8px"></ol></div>` +
    `<div><label for="req">What should change?</label><textarea id="req" rows="3" placeholder="e.g. make the eyes darker"></textarea></div>` +
    `<div><h2 id="out-h">Instruction</h2><pre id="out" aria-labelledby="out-h" style="margin-top:8px"></pre></div>` +
    `<div class="row"><button type="button" class="primary" id="copy" disabled>Copy</button><button type="button" id="clear">Clear</button><span class="status" id="status" role="status" aria-live="polite"></span></div>` +
    `</div></aside>` +
    `<script type="application/json" id="mk-data">${data}</script>` +
    `<script>${CORE}\n${CLIENT}</script>` +
    `</body></html>\n`;
}
