// Ink one rendered panel: screentone regions, solid blacks, hatching, brush
// outlines and decals, as SVG path strings in buffer pixels.
//
// Every random draw is a pure function of stable keys (panel seed, layer,
// line or cell index, part name), so ink in one screen region never depends
// on a random sequence consumed elsewhere.
import { project } from './raster.mjs';
import { hash32, rand01 } from './rng.mjs';
import { resolveStyle } from './styles.mjs';

const { abs, max, min, hypot, floor, ceil, cos, sin, pow, PI } = Math;

/**
 * Compact path encoding: absolute M for the first point, relative l for the rest.
 * Coordinates are rounded to one decimal of a buffer pixel below ss 1.5 and to whole
 * buffer pixels from ss 1.5 (at most 0.67 page pixels after the 1/ss scale-down).
 * Deltas come from the rounded absolute positions, so rounding never accumulates.
 */
export function encoder(ss = 1) {
  const q = ss >= 1.5 ? 1 : 10;
  const num = u => {
    if (q === 1 || u % 10 === 0) return String(u / q);
    const a = abs(u), i = floor(a / 10), f = a % 10;
    return (u < 0 ? '-' : '') + (i ? i : '') + '.' + f;
  };
  const join = (a, b) => (b[0] === '-' ? a + b : a + ' ' + b);
  const val = v => num(Math.round(v * q));
  const path = (pts, close = false) => {
    let px = Math.round(pts[0] * q), py = Math.round(pts[1] * q);
    let body = '';
    for (let i = 2; i < pts.length; i += 2) {
      const x = Math.round(pts[i] * q), y = Math.round(pts[i + 1] * q);
      if (x === px && y === py) continue;
      body = join(body ? join(body, num(x - px)) : num(x - px), num(y - py));
      px = x; py = y;
    }
    const s = 'M' + join(num(Math.round(pts[0] * q)), num(Math.round(pts[1] * q))) + (body ? 'l' + body : '');
    return close ? s + 'z' : s;
  };
  return { q, num, val, path };
}

/** Sub-polyline between fractions a and b of the arc length. */
function cutByLength(pts, a, b) {
  const n = pts.length / 2, L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]));
  const tot = L[n - 1], la = a * tot, lb = b * tot;
  const at = l => {
    let i = 1;
    while (i < n - 1 && L[i] < l) i++;
    const t = (l - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
    return [pts[i * 2 - 2] + t * (pts[i * 2] - pts[i * 2 - 2]), pts[i * 2 - 1] + t * (pts[i * 2 + 1] - pts[i * 2 - 1])];
  };
  const out = at(la);
  for (let i = 1; i < n - 1; i++) if (L[i] > la && L[i] < lb) out.push(pts[i * 2], pts[i * 2 + 1]);
  out.push(...at(lb));
  return out;
}

/** Polyline length. */
function lengthOf(pts) {
  let l = 0;
  for (let i = 2; i < pts.length; i += 2) l += hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return l;
}
const sst = (a, b, x) => { const t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Float in [0, 1) from a numeric base hash and up to four integers. */
function rh(base, a, b = 0, c = 0, d = 0) {
  let h = base ^ 0x9e3779b9;
  h = Math.imul(h ^ (a | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (b | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (c | 0), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (d | 0), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Scanline hatching: strokes may start once per cell of this length along a line.
const SCAN_CELL = 8;
const SCAN_DIRS = { diag: -PI / 4, diag2: 0.61 };

/**
 * r: output of renderPanel. style: preset name or style object.
 * seed: panel id string. regions: [{ rect: [x, y, w, h], feather, set }] in panel pixels.
 * ss: supersampling factor of the buffers (scales lengths, spacing and line weights).
 */
export function inkPanel(r, { style = 'seinen-dense', seed, regions = [], ss = 1 } = {}) {
  if (typeof seed !== 'string' || !seed) throw new Error('inkPanel: seed must be a non-empty string (the panel id)');
  const st = resolveStyle(style);
  const { W, H, D, cam, parts } = r;
  const id = r.buf.id, dp = r.buf.depth, { nx, ny, nz } = r.nrm;
  const aux = r.aux;
  const N = W * H;
  const K = ss, DK = st.depthK;
  const toneSet = new Set(st.toneMats);
  const enc = encoder(ss);

  // Per-part tables; index 0 is the background ("sky").
  const P1 = parts.length + 1;
  const mats = ['sky', ...parts.map(p => p.mat)];
  const cfgs = mats.map((m, p) => {
    const c = st.materials[m];
    if (!c) throw new Error(`style "${st.name || '?'}" has no material "${m}"${p ? ` (part "${parts[p - 1].name}")` : ''}`);
    return c;
  });
  const kinds = mats.map((m, p) => {
    const fields = (p && parts[p - 1].fields) || cfgs[p].fields;
    return [0, 1, 2].map(k => (toneSet.has(m) && k < 2 ? null : fields[k]));
  });
  const partAng = new Float32Array(P1);
  const nameOf = p => (p ? parts[p - 1].name : 'sky');
  for (let p = 0; p < P1; p++) partAng[p] = 0.55 + (rand01(seed, 'ang', nameOf(p)) - 0.5) * 0.7;
  const axDef = [0, cam.up[1], cam.fwd[1]];
  const axs = [axDef];
  for (const pt of parts) {
    if (!pt.axis) { axs.push(axDef); continue; }
    const a = pt.axis, l = hypot(a[0], a[1], a[2]) || 1;
    axs.push([(a[0] * cam.right[0] + a[1] * cam.right[1] + a[2] * cam.right[2]) / l, (a[0] * cam.up[0] + a[1] * cam.up[1] + a[2] * cam.up[2]) / l, (a[0] * cam.fwd[0] + a[1] * cam.fwd[1] + a[2] * cam.fwd[2]) / l]);
  }

  // Per-pixel thresholds and multipliers, blended in from regions.
  const TB = new Float32Array(N).fill(st.black), T1 = new Float32Array(N).fill(st.tone1), T2 = new Float32Array(N).fill(st.tone2);
  const HM = new Float32Array(N).fill(1), BM = new Float32Array(N).fill(1);
  for (const reg of regions) {
    const [rx, ry, rw, rhh] = reg.rect.map(v => v * ss);
    const F = (reg.feather || 0) * ss, s = reg.set || {};
    const x0 = max(0, floor(rx - F)), x1 = min(W - 1, ceil(rx + rw + F)), y0 = max(0, floor(ry - F)), y1 = min(H - 1, ceil(ry + rhh + F));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d = hypot(max(0, rx - px, px - rx - rw), max(0, ry - py, py - ry - rhh));
      const w = d <= 0 ? 1 : F > 0 ? 1 - sst(0, F, d) : 0;
      if (w <= 0) continue;
      const i = y * W + x;
      if (s.black !== undefined) TB[i] += (s.black - TB[i]) * w;
      if (s.tone1 !== undefined) T1[i] += (s.tone1 - T1[i]) * w;
      if (s.tone2 !== undefined) T2[i] += (s.tone2 - T2[i]) * w;
      if (s.hatch !== undefined) HM[i] += (s.hatch - HM[i]) * w;
      if (s.brush !== undefined) BM[i] += (s.brush - BM[i]) * w;
    }
  }

  // Hatch direction fields; result in dir.
  const dir = [0, 0];
  const field = (kind, i, p) => {
    const a = nx[i], b = ny[i], c = nz[i];
    let x, y;
    switch (kind) {
      case 'sil': x = b; y = a; break;
      case 'cross': x = a; y = -b; break;
      case 'lat': { const ax = axs[p]; x = ax[1] * c - ax[2] * b; y = -(ax[2] * a - ax[0] * c); break; }
      case 'mer': {
        const ax = axs[p];
        const tx = ax[1] * c - ax[2] * b, ty = ax[2] * a - ax[0] * c, tz = ax[0] * b - ax[1] * a;
        x = b * tz - c * ty; y = -(c * tx - a * tz); break;
      }
      case 'fix': x = cos(partAng[p]); y = -sin(partAng[p]); break;
      case 'fix2': x = cos(partAng[p] + 1.25); y = -sin(partAng[p] + 1.25); break;
      case 'flow': {
        const px = i % W, py = (i / W) | 0, s = 5;
        if (px < s || py < s || px >= W - s || py >= H - s) { x = 1; y = 0.08; break; }
        const gx = D[i + s] - D[i - s], gy = D[i + s * W] - D[i - s * W];
        x = -gy + 0.012; y = gx + 0.002; break;
      }
      default: return false;
    }
    const l = hypot(x, y);
    if (l < 0.1) {
      if (kind === 'flow') { dir[0] = 1; dir[1] = 0.08; return true; }
      dir[0] = cos(partAng[p]); dir[1] = -sin(partAng[p]); return true;
    }
    dir[0] = x / l; dir[1] = y / l; return true;
  };

  // Each hatch stroke is emitted three times (full, middle, core) so stacked widths taper it.
  const hatch = [[], [], []];
  // Short strokes are a single thin line; longer ones also get a mid and a core tier.
  const MID = 12 * K, CORE = 28 * K;
  const emitStroke = pts => {
    const thin = enc.path(pts);
    if (!thin.includes('l')) return;
    hatch[0].push(thin);
    const L = lengthOf(pts);
    if (L >= MID) hatch[1].push(enc.path(cutByLength(pts, 0.16, 0.84)));
    if (L >= CORE) hatch[2].push(enc.path(cutByLength(pts, 0.33, 0.67)));
  };
  const tauOf = (p, k, u) => { const t = cfgs[p].thresholds[k]; return t[0] + u * (t[1] - t[0]); };
  const lenOf = (p, u) => { const l = cfgs[p].len; return (l[0] + u * (l[1] - l[0])) * K; };

  // Straight parallel hatching on a fixed lattice of lines. Along a line, a stroke can
  // start once per cell; it runs until its tone ends, its length is used up, or a few
  // pixels before the next cell's stroke. Every choice depends on its own cell only.
  const scan = (k, kind, sp) => {
    const ang = SCAN_DIRS[kind], ca = cos(ang), sa = sin(ang);
    const base = hash32(seed, 'scan', k, kind);
    let cmin = 1e9, cmax = -1e9, tmin = 1e9, tmax = -1e9;
    for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const c = -sa * x + ca * y, t = ca * x + sa * y;
      cmin = min(cmin, c); cmax = max(cmax, c); tmin = min(tmin, t); tmax = max(tmax, t);
    }
    const t0 = floor(tmin), T = ceil(tmax) - t0 + 1;
    const pix = new Int32Array(T), ptx = new Float32Array(T), pty = new Float32Array(T);
    const C = SCAN_CELL * K;
    const starts = [];
    const qualifies = (i, u, slack) => {
      if (i < 0) return false;
      const p = id[i];
      if (kinds[p][k] !== kind) return false;
      return D[i] * HM[i] >= tauOf(p, k, u) - slack && D[i] < TB[i] + 0.02 + slack * 0.4;
    };
    for (let j = floor(cmin / sp) - 1; j <= ceil(cmax / sp); j++) {
      const c = (j + 0.5 + (rh(base, j, 0, 0) - 0.5) * 0.28) * sp;
      let any = false;
      for (let n = 0; n < T; n++) {
        const t = t0 + n, x = -sa * c + ca * t, y = ca * c + sa * t;
        ptx[n] = x; pty[n] = y;
        if (x < 0 || y < 0 || x >= W || y >= H) { pix[n] = -1; continue; }
        const i = floor(y) * W + floor(x);
        pix[n] = i;
        if (!any && kinds[id[i]][k] === kind) any = true;
      }
      if (!any) continue;
      const phase = rh(base, j, 1, 0) * C;
      // Pass 1: at most one start per cell.
      starts.length = 0;
      let cell = null, done = false;
      for (let n = 0; n < T; n++) {
        const t = t0 + n, m = floor((t - phase) / C);
        if (m !== cell) { cell = m; done = false; }
        if (done) continue;
        const i = pix[n];
        const u = rh(base, j, m, 2);
        if (!qualifies(i, u, 0)) continue;
        done = true;
        const boundary = !(n > 0 && qualifies(pix[n - 1], u, 0));
        const p = id[i], l = cfgs[p].len;
        const q = C / (0.4 * (l[0] + l[1]) * K);
        if (boundary || rh(base, j, m, 3) < q) starts.push(n, m);
      }
      // Pass 2: trace each stroke up to the next start.
      for (let s = 0; s < starts.length; s += 2) {
        const n0 = starts[s], m = starts[s + 1];
        const next = s + 2 < starts.length ? starts[s + 2] : T;
        const i0 = pix[n0], p = id[i0];
        const u = rh(base, j, m, 2);
        const maxLen = lenOf(p, rh(base, j, m, 4));
        const gap = 2 + floor(rh(base, j, m, 5) * 4);
        const w = (rh(base, j, m, 6) - 0.5) * 0.5, wx = -sa * w, wy = ca * w;
        let n = n0, len = 0;
        for (;;) {
          const nn = n + 1;
          if (nn >= next - gap || nn >= T || len >= maxLen) break;
          const i = pix[nn];
          if (i < 0 || id[i] !== p || !qualifies(i, u, 0.05)) break;
          n = nn; len++;
        }
        // Scan strokes are straight: two points (the probe needed at least three samples, 6 px).
        if (len >= 6) emitStroke([ptx[n0] + wx, pty[n0] + wy, ptx[n] + wx, pty[n] + wy]);
      }
    }
  };

  // Form-following hatching: one candidate seed per grid cell, visited in a fixed hashed
  // order. Occupancy is kept per part, so a stroke only blocks strokes of its own part.
  const stream = (k, sp) => {
    const gw = ceil(W / sp), gh = ceil(H / sp), G = gw * gh;
    const base = hash32(seed, 'stream', k), orderBase = hash32(seed, 'order', k);
    const keys = new Uint32Array(G), order = new Int32Array(G);
    for (let c = 0; c < G; c++) { keys[c] = rh(orderBase, c % gw, (c / gw) | 0) * 4294967296; order[c] = c; }
    order.sort((a, b) => keys[a] - keys[b] || a - b);
    const occ = new Map();
    let me = 0;
    for (const c0 of order) {
      const gx = c0 % gw, gy = (c0 / gw) | 0;
      const sx = (gx + rh(base, gx, gy, 0)) * sp, sy = (gy + rh(base, gx, gy, 1)) * sp;
      if (sx >= W || sy >= H) continue;
      const i0 = floor(sy) * W + floor(sx);
      const p = id[i0], kind = kinds[p][k];
      if (!kind || SCAN_DIRS[kind] !== undefined) continue;
      const tau = tauOf(p, k, rh(base, gx, gy, 2));
      const d0 = D[i0] * HM[i0];
      if (d0 < tau || D[i0] >= TB[i0] + 0.02) continue;
      const key0 = c0 * P1 + p;
      if (occ.has(key0)) continue;
      if (!field(kind, i0, p)) continue;
      me++;
      const jit = (rh(base, gx, gy, 3) - 0.5) * 0.14, cj = cos(jit), sj = sin(jit);
      const sdx = dir[0] * cj - dir[1] * sj, sdy = dir[0] * sj + dir[1] * cj;
      const maxLen = lenOf(p, rh(base, gx, gy, 4));
      const marked = [key0];
      occ.set(key0, me);
      const half = sgn => {
        const pts = [];
        let x = sx, y = sy, pdx = sdx * sgn, pdy = sdy * sgn, n = 0;
        for (let s = 0; s < maxLen / 2; s++) {
          x += pdx; y += pdy;
          if (x < 0 || y < 0 || x >= W || y >= H) break;
          const j = floor(y) * W + floor(x);
          if (id[j] !== p) break;
          if (D[j] * HM[j] < tau - 0.05 || D[j] >= TB[j] + 0.04) break;
          const key = (floor(y / sp) * gw + floor(x / sp)) * P1 + p;
          const o = occ.get(key);
          if (o && o !== me) break;
          if (!o) { occ.set(key, me); marked.push(key); }
          field(kind, j, p);
          let ddx = dir[0] * cj - dir[1] * sj, ddy = dir[0] * sj + dir[1] * cj;
          let dt = ddx * pdx + ddy * pdy;
          if (dt < 0) { ddx = -ddx; ddy = -ddy; dt = -dt; }
          if (dt < 0.55) break;
          pdx = ddx; pdy = ddy;
          if (++n % 2 === 0) pts.push(x, y);
        }
        if (n % 2) pts.push(x, y);
        return pts;
      };
      const a = half(1), b = half(-1);
      if ((a.length + b.length) / 2 + 1 < 3) { for (const key of marked) occ.delete(key); continue; }
      const pts = [];
      for (let i = b.length - 2; i >= 0; i -= 2) pts.push(b[i], b[i + 1]);
      pts.push(sx, sy);
      for (let i = 0; i < a.length; i += 2) pts.push(a[i], a[i + 1]);
      emitStroke(rdp(pts, 0.35 * K));
    }
  };

  for (let k = 0; k < 3; k++) {
    const sp = st.hatchSpacing[k] * K;
    scan(k, 'diag', sp);
    scan(k, 'diag2', sp);
    stream(k, sp);
  }

  // Chain mail: rows of small arcs.
  const mail = [];
  const mailArc = `${enc.val(2.1 * K)}${enc.val(-2.9 * K)} ${enc.val(4.2 * K)} 0`;
  for (let y = 2, row = 0; y < H - 2; y += 3.3 * K, row++)
    for (let x = 2 + (row % 2) * 2.2 * K; x < W - 3; x += 4.4 * K) {
      const i = floor(y) * W + floor(x);
      if (mats[id[i]] !== 'mail' || D[i] >= TB[i]) continue;
      mail.push(`M${enc.val(x - 2.1 * K)} ${enc.val(y)}q${mailArc}`);
    }

  // Grit dots on ground and stone: one candidate per cell.
  const dots = [];
  {
    const cs = 5.1 * K, base = hash32(seed, 'dots');
    for (let cy = 0; cy * cs < H; cy++) for (let cx = 0; cx * cs < W; cx++) {
      const x = (cx + rh(base, cx, cy, 0)) * cs, y = (cy + rh(base, cx, cy, 1)) * cs;
      if (x >= W || y >= H) continue;
      const i = floor(y) * W + floor(x), m = mats[id[i]];
      if (m !== 'ground' && m !== 'stone') continue;
      const d = D[i];
      if (d >= TB[i] || rh(base, cx, cy, 2) > d * 0.9) continue;
      // A dot is a sub-pixel square of the same area as a disc of radius rr.
      const rr = (0.35 + rh(base, cx, cy, 3) * 0.55) * K;
      const sd = Math.round(rr * 17.7) / 10, h = sd / 2, sz = String(sd).replace(/^0\./, '.');
      dots.push(`M${enc.val(x - h)} ${enc.val(y - h)}h${sz}v${sz}h-${sz}z`);
    }
  }

  const CW = W + 1;
  const blacks = traceLoops(W, H, i => D[i] >= TB[i], enc);
  const isTone = i => toneSet.has(mats[id[i]]);
  const tone1 = toneSet.size ? traceLoops(W, H, i => isTone(i) && D[i] >= T1[i], enc) : [];
  const tone2 = toneSet.size ? traceLoops(W, H, i => isTone(i) && D[i] >= T2[i], enc) : [];

  // Brush outlines: filled shapes with a pressure profile.
  const brush = [];
  const brushBase = hash32(seed, 'brush');
  const wobble = a => 0.5 + 0.25 * (sin(a) + sin(a * 2.3 + 1.7));
  const Dat = (x, y) => D[max(0, min(H - 1, floor(y))) * W + max(0, min(W - 1, floor(x)))];
  const BMat = (x, y) => BM[max(0, min(H - 1, floor(y))) * W + max(0, min(W - 1, floor(x)))];
  const taper = 7.5 * K;
  const brushOf = (pts, cls, closed, tA, tB, ph) => {
    const simp = closed ? rdpClosed(pts, 0.2) : rdp(pts, 0.2);
    const n = simp.length / 2;
    if (n < 2) return;
    const L = [0];
    for (let i = 1; i < n; i++) L.push(L[i - 1] + hypot(simp[i * 2] - simp[i * 2 - 2], simp[i * 2 + 1] - simp[i * 2 - 1]));
    const tot = L[n - 1];
    if (tot < 2.2) return;
    const base = st.brush[cls - 1] * K;
    const tl = min(taper, tot * 0.38);
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const a = max(0, i - 1), b = min(n - 1, i + 1);
      let tx = simp[b * 2] - simp[a * 2], ty = simp[b * 2 + 1] - simp[a * 2 + 1];
      const tn = hypot(tx, ty) || 1; tx /= tn; ty /= tn;
      const x = simp[i * 2], y = simp[i * 2 + 1];
      let w = base * BMat(x, y);
      if (!closed) {
        const ta = tA ? min(1, L[i] / tl) : 1, tb = tB ? min(1, (tot - L[i]) / tl) : 1;
        w *= 0.16 + 0.84 * pow(min(ta, tb), 0.75);
      }
      const dl = min(1, (Dat(x - ty * 1.5, y + tx * 1.5) + Dat(x + ty * 1.5, y - tx * 1.5)) * 0.5);
      w *= 0.7 + 0.65 * dl;
      w *= 0.86 + 0.3 * wobble(ph + L[i] * 0.09);
      left.push(x - ty * w / 2, y + tx * w / 2); right.push(x + ty * w / 2, y - tx * w / 2);
    }
    for (let i = n - 1; i >= 0; i--) left.push(right[i * 2], right[i * 2 + 1]);
    brush.push(enc.path(left, true));
  };
  {
    // Edge classes between neighbouring pixels: 1 crease, 2 inner edge, 3 silhouette.
    const hE = new Uint8Array(CW * (H + 1)), vE = new Uint8Array(CW * (H + 1));
    const cls = (a, b) => {
      if (D[a] >= TB[a] && D[b] >= TB[b]) return 0;
      const ia = id[a], ib = id[b];
      const dz = abs(dp[a] - dp[b]);
      if (ia !== ib) { if (!ia || !ib) return 3; return dz > 0.07 * DK ? 3 : 2; }
      if (!ia) return 0;
      if (dz > 0.05 * DK) return 2;
      const dn = nx[a] * nx[b] + ny[a] * ny[b] + nz[a] * nz[b];
      return dn < (cfgs[ia].crease ?? 0.84) ? 1 : 0;
    };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x + 1 < W) { const c = cls(i, i + 1); if (c) vE[y * CW + x + 1] = c; }
      if (y + 1 < H) { const c = cls(i, i + W); if (c) hE[(y + 1) * CW + x] = c; }
    }
    const hV = new Uint8Array(hE.length), vV = new Uint8Array(vE.length);
    const ecls = (n, d) => d === 0 ? hE[n] : d === 1 ? vE[n] : d === 2 ? (n % CW ? hE[n - 1] : 0) : (n >= CW ? vE[n - CW] : 0);
    const evis = (n, d) => d === 0 ? hV[n] : d === 1 ? vV[n] : d === 2 ? hV[n - 1] : vV[n - CW];
    const emark = (n, d) => { if (d === 0) hV[n] = 1; else if (d === 1) vV[n] = 1; else if (d === 2) hV[n - 1] = 1; else vV[n - CW] = 1; };
    const step = [1, CW, -1, -CW];
    const deg = n => (ecls(n, 0) ? 1 : 0) + (ecls(n, 1) ? 1 : 0) + (ecls(n, 2) ? 1 : 0) + (ecls(n, 3) ? 1 : 0);
    const follow = (n, d) => {
      const startDeg = deg(n);
      const pts = [n % CW, (n / CW) | 0];
      const ph = rh(brushBase, pts[0], pts[1]) * 40;
      const cc = [0, 0, 0, 0];
      let closed = false;
      for (;;) {
        emark(n, d); cc[ecls(n, d)]++;
        n += step[d];
        pts.push(n % CW, (n / CW) | 0);
        if (deg(n) !== 2) break;
        let nd = -1;
        for (let q = 0; q < 4; q++) if (q !== ((d + 2) & 3) && ecls(n, q)) nd = q;
        if (nd < 0) break;
        if (evis(n, nd)) { closed = true; break; }
        d = nd;
      }
      const endDeg = deg(n);
      const tot = cc[1] + cc[2] + cc[3];
      const c = cc[3] > tot * 0.4 ? 3 : cc[2] + cc[3] > tot * 0.4 ? 2 : 1;
      const m = pts.length / 2;
      if (c === 1 && m < 7) return;
      if (c === 2 && m < 4) return;
      const midp = [pts[0], pts[1]];
      for (let i = 1; i < m; i++) midp.push((pts[i * 2 - 2] + pts[i * 2]) / 2, (pts[i * 2 - 1] + pts[i * 2 + 1]) / 2);
      midp.push(pts[m * 2 - 2], pts[m * 2 - 1]);
      const sm = closed ? smoothClosed(Float32Array.from(midp.slice(2, -2)), 4) : smoothOpen(Float32Array.from(midp), 4);
      brushOf(Array.from(sm), c, closed, c === 1 || startDeg === 1, c === 1 || endDeg === 1, ph);
    };
    const total = CW * (H + 1);
    for (let n = 0; n < total; n++) {
      const dg = deg(n);
      if (!dg || dg === 2) continue;
      for (let d = 0; d < 4; d++) if (ecls(n, d) && !evis(n, d)) follow(n, d);
    }
    for (let n = 0; n < total; n++) for (let d = 0; d < 2; d++) if (ecls(n, d) && !evis(n, d)) follow(n, d);
  }

  return { tone1, tone2, blacks, hatch, mail, dots, brush, decals: inkDecals(r, K, DK, TB, enc) };
}

/** Project decals (lines, polys, rivets, holes, strands) with a depth test. */
function inkDecals(r, K, DK, TB, enc) {
  const pathOf = enc.path;
  const { W, H, D, cam, aux } = r, dp = r.buf.depth;
  const dec = { ko: [], lines: [[], [], []], shapes: [], strandsWhite: [], strandsBlack: [], rivets: [], holes: [] };
  const vis = (q, tol = 0.014 * DK) => {
    const x = floor(q[0]), y = floor(q[1]);
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    return q[2] >= dp[y * W + x] - tol;
  };
  for (const d of r.decals) {
    if (d.type === 'strand') {
      let run = [], col = null;
      const fl = () => { if (run.length >= 4) (col === 'w' ? dec.strandsWhite : dec.strandsBlack).push(pathOf(run, false)); run = []; };
      for (const p of d.pts) {
        const q = project(cam, p);
        let c = null;
        if (vis(q, 0.02 * DK)) {
          const i = floor(q[1]) * W + floor(q[0]);
          if (D[i] < TB[i]) c = 'b'; else if (aux && aux[i] > d.thr) c = 'w';
        }
        if (c !== col) { fl(); col = c; }
        if (c) run.push(q[0], q[1]);
      }
      fl();
    } else if (d.type === 'poly') {
      const qs = d.pts.filter(p => p).map(p => project(cam, p));
      if (!qs.length) continue;
      if (d.closed) {
        if (qs.filter(q => vis(q)).length < qs.length * 0.6) continue;
        const flat = [];
        for (const q of qs) flat.push(q[0], q[1]);
        dec.shapes.push({ d: pathOf(flat, true), fill: d.fill || 'none', stroke: d.stroke || 'none', sw: d.sw || 0 });
      } else {
        let run = [];
        const fl = () => { if (run.length >= 4) dec.shapes.push({ d: pathOf(run, false), fill: 'none', stroke: d.stroke || '#000', sw: d.sw || 1 }); run = []; };
        for (const q of qs) { if (vis(q)) run.push(q[0], q[1]); else fl(); }
        fl();
      }
    } else if (d.type === 'rivet' || d.type === 'hole') {
      const q = project(cam, d.p);
      if (!vis(q)) continue;
      const rr = max(1.1 * K, d.r * cam.scale);
      (d.type === 'rivet' ? dec.rivets : dec.holes).push([q[0], q[1], rr]);
    } else {
      let run = [];
      const flush = () => {
        if (run.length >= 4) { const s = pathOf(run, false); dec.lines[min(2, d.w)].push(s); if (d.ko) dec.ko.push(s); }
        run = [];
      };
      for (const p of d.pts) {
        if (!p) { flush(); continue; }
        const q = project(cam, p);
        if (vis(q)) run.push(q[0], q[1]); else flush();
      }
      flush();
    }
  }
  return dec;
}

// ---- Geometry helpers -------------------------------------------------------


function smoothClosed(pts, it) {
  const n = pts.length / 2;
  let a = pts;
  for (let k = 0; k < it; k++) {
    const b = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const p = (i + n - 1) % n, q = (i + 1) % n;
      b[i * 2] = 0.25 * a[p * 2] + 0.5 * a[i * 2] + 0.25 * a[q * 2];
      b[i * 2 + 1] = 0.25 * a[p * 2 + 1] + 0.5 * a[i * 2 + 1] + 0.25 * a[q * 2 + 1];
    }
    a = b;
  }
  return a;
}

function smoothOpen(pts, it) {
  const n = pts.length / 2;
  let a = pts;
  for (let k = 0; k < it; k++) {
    const b = new Float32Array(n * 2);
    b[0] = a[0]; b[1] = a[1]; b[n * 2 - 2] = a[n * 2 - 2]; b[n * 2 - 1] = a[n * 2 - 1];
    for (let i = 1; i < n - 1; i++) {
      b[i * 2] = 0.25 * a[i * 2 - 2] + 0.5 * a[i * 2] + 0.25 * a[i * 2 + 2];
      b[i * 2 + 1] = 0.25 * a[i * 2 - 1] + 0.5 * a[i * 2 + 1] + 0.25 * a[i * 2 + 3];
    }
    a = b;
  }
  return a;
}

function rdp(pts, eps) {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a * 2], ay = pts[a * 2 + 1], bx = pts[b * 2] - ax, by = pts[b * 2 + 1] - ay;
    const l = hypot(bx, by) || 1e-9;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      const dd = abs((pts[i * 2] - ax) * by - (pts[i * 2 + 1] - ay) * bx) / l;
      if (dd > md) { md = dd; mi = i; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

function rdpClosed(ring, eps) {
  const n = ring.length / 2;
  let mi = 0, md = -1;
  for (let i = 1; i < n; i++) { const d = hypot(ring[i * 2] - ring[0], ring[i * 2 + 1] - ring[1]); if (d > md) { md = d; mi = i; } }
  const a = rdp(ring.slice(0, mi * 2 + 2), eps);
  const b = rdp(ring.slice(mi * 2).concat([ring[0], ring[1]]), eps);
  return a.concat(b.slice(2));
}

/** Boundaries of the pixel mask `inside(i)` as smoothed closed paths (outer and hole loops). */
function traceLoops(W, H, inside, enc) {
  const CW = W + 1, N = W * H;
  const loops = [];
  const out = new Uint8Array(CW * (H + 1));
  const m = new Uint8Array(N);
  for (let i = 0; i < N; i++) m[i] = inside(i) ? 1 : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!m[i]) continue;
    if (y === 0 || !m[i - W]) out[y * CW + x] |= 1;
    if (x === W - 1 || !m[i + 1]) out[y * CW + x + 1] |= 2;
    if (y === H - 1 || !m[i + W]) out[(y + 1) * CW + x + 1] |= 4;
    if (x === 0 || !m[i - 1]) out[(y + 1) * CW + x] |= 8;
  }
  const step = [1, CW, -1, -CW];
  for (let n0 = 0; n0 < out.length; n0++) {
    while (out[n0]) {
      let d = out[n0] & 1 ? 0 : out[n0] & 2 ? 1 : out[n0] & 4 ? 2 : 3;
      let n = n0;
      const pts = [];
      for (;;) {
        out[n] &= ~(1 << d);
        pts.push(n % CW, (n / CW) | 0);
        n += step[d];
        if (n === n0) break;
        const mm = out[n];
        const rt = (d + 1) & 3, lt = (d + 3) & 3;
        if (mm & (1 << rt)) d = rt; else if (mm & (1 << d)) { /* straight on */ } else if (mm & (1 << lt)) d = lt; else break;
      }
      if (pts.length / 2 < 10) continue;
      const sm = smoothClosed(Float32Array.from(pts), 3);
      const simp = rdpClosed(Array.from(sm), 0.32);
      if (simp.length >= 8) loops.push(enc.path(simp, true));
    }
  }
  return loops;
}
