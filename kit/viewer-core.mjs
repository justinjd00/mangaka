// Pure functions shared by Node and the page viewer: read the part grid of
// page.map.json and turn a selected rectangle into a rework instruction.
// This file is inlined into page.html with its `export` keywords stripped, so it
// must stay free of imports and Node APIs.

/** The part ids of one map panel, row-major, ceil(w/2) x ceil(h/2) cells; 0 is background. */
export function decodeRle(panel) {
  const rle = panel.rle;
  let n = 0;
  for (let i = 1; i < rle.length; i += 2) n += rle[i];
  const out = new Int16Array(n);
  for (let i = 0, o = 0; i < rle.length; i += 2) { out.fill(rle[i], o, o + rle[i + 1]); o += rle[i + 1]; }
  return out;
}

const round2 = v => Math.round(v * 100) / 100;

/** A part name without a trailing numeric segment: "boy.hair.43" -> "boy.hair". */
export const partGroup = name => name.replace(/\.\d+$/, '');
const MAX_PARTS = 8;

/** Intersection of two [x, y, w, h] rects, or null when they do not overlap. */
function clip(a, b) {
  const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
  return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
}

/** Whether (x, y) lies inside the polygon [[x, y], ...] (even-odd rule). */
function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The panel under a page rect [x, y, w, h] (page pixels) and what it covers.
 * The panel is the smallest one holding the rect's centre (insets sit on top;
 * a panel with a clip polygon holds only the points inside it);
 * when no panel holds it, the one overlapping the rect most. Returns
 * { panel, region, parts }: region is the rect clipped to the panel as
 * fractions of the panel rect (two decimals), parts are the top eight part
 * groups under it by cell count (names that differ only by a trailing numeric
 * segment are summed into one group, see partGroup), each { name, share } with
 * share a whole percentage of the rect's cells inside the panel, at least 1. panel is null when the rect misses every panel.
 */
export function partsInRect(map, rect) {
  const cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
  const area = p => p.rect[2] * p.rect[3];
  const holding = map.panels.filter(p => cx >= p.rect[0] && cx < p.rect[0] + p.rect[2] && cy >= p.rect[1] && cy < p.rect[1] + p.rect[3] && (!p.clip || inPolygon(p.clip, cx, cy)));
  let panel = holding.sort((a, b) => area(a) - area(b))[0] ?? null;
  if (!panel) {
    let best = 0;
    for (const p of map.panels) {
      const c = clip(rect, p.rect), a = c ? c[2] * c[3] : 0;
      if (a > best) { best = a; panel = p; }
    }
  }
  const inside = panel && clip(rect, panel.rect);
  if (!inside) return { panel: null, region: null, parts: [] };

  const [px, py, pw, ph] = panel.rect;
  const region = [(inside[0] - px) / pw, (inside[1] - py) / ph, inside[2] / pw, inside[3] / ph].map(round2);
  // Cells whose centres fall inside the clipped rect, in panel pixels.
  const gw = Math.ceil(pw / 2), gh = Math.ceil(ph / 2), ids = decodeRle(panel);
  const x0 = inside[0] - px, y0 = inside[1] - py, x1 = x0 + inside[2], y1 = y0 + inside[3];
  let c0 = Math.max(0, Math.ceil((x0 - 1) / 2)), c1 = Math.min(gw - 1, Math.ceil((x1 - 1) / 2) - 1);
  let r0 = Math.max(0, Math.ceil((y0 - 1) / 2)), r1 = Math.min(gh - 1, Math.ceil((y1 - 1) / 2) - 1);
  // A rect smaller than a cell takes the cell under its centre.
  if (c1 < c0) c0 = c1 = Math.min(gw - 1, Math.max(0, Math.floor((x0 + x1) / 4)));
  if (r1 < r0) r0 = r1 = Math.min(gh - 1, Math.max(0, Math.floor((y0 + y1) / 4)));
  const counts = new Map();
  let total = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const id = ids[r * gw + c];
    total++;
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  // Numbered siblings (boy.hair.19, boy.hair.43) count as one group (boy.hair).
  const groups = new Map();
  for (const [id, n] of counts) {
    const name = partGroup(panel.parts[id - 1] ?? `part-${id}`);
    groups.set(name, (groups.get(name) || 0) + n);
  }
  const parts = [...groups]
    .map(([name, n]) => ({ name, n }))
    .sort((a, b) => b.n - a.n || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(({ name, n }) => ({ name, share: Math.round(100 * n / total) }))
    .filter(q => q.share >= 1)
    .slice(0, MAX_PARTS);
  return { panel: panel.id, region, parts };
}

/** The rework instruction block (design section 4.6), without a trailing newline. */
export function formatInstruction({ pageFile, panel, region, parts, request }) {
  const reg = region.map(v => Number(v).toFixed(2)).join(', ');
  const list = parts.length ? parts.map(q => `${q.name} (${q.share}%)`).join(', ') : 'none';
  const req = String(request ?? '').replace(/\s+/g, ' ').trim();
  return `/mangaka rework ${pageFile || 'page.mjs'}\n` +
    `panel: ${panel}   region: [${reg}]\n` +
    `parts: ${list}\n` +
    `request: ${req}`;
}
