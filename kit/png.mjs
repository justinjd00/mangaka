import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

// Bit depths each colour type allows (PNG spec, table 11.1).
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };

/** Decode a non-interlaced PNG (colour types 0, 2, 3, 4, 6; every bit depth the spec allows) to RGBA bytes. */
export function decodePNG(buf) {
  if (buf.length < 8 || SIG.some((v, i) => buf[i] !== v)) throw new Error('not a PNG file (bad signature)');
  let o = 8, w = 0, h = 0, bd = 8, ct = 6, il = 0, plte = null, trns = null;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') plte = d;
    else if (type === 'tRNS') trns = d;
    else if (type === 'IDAT') idat.push(d);
    else if (type === 'IEND') break;
    o += 12 + len;
  }
  if (!DEPTHS[ct]) throw new Error(`PNG colour type ${ct} not supported`);
  if (!DEPTHS[ct].includes(bd)) throw new Error(`PNG bit depth ${bd} not supported for colour type ${ct}`);
  if (il) throw new Error('interlaced PNG not supported');
  if (ct === 3 && !plte) throw new Error('PNG palette image without a PLTE chunk');
  const ch = [1, 0, 3, 1, 2, 0, 4][ct], bpp = Math.max(1, ch * bd / 8), stride = Math.ceil(w * ch * bd / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * h) throw new Error('PNG image data is truncated');
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], ro = y * (stride + 1) + 1, po = y * stride, pp = po - stride;
    if (f > 4) throw new Error(`PNG row ${y}: unknown filter type ${f}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[po + x - bpp] : 0, b = y ? px[pp + x] : 0, c = (x >= bpp && y) ? px[pp + x - bpp] : 0;
      let v = raw[ro + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c;
      }
      px[po + x] = v & 255;
    }
  }
  // Sample k of row y. 16-bit samples keep their high byte (big-endian, first byte of each
  // sample); samples under 8 bits are packed from the high bit of each byte down.
  const max = (1 << Math.min(bd, 8)) - 1, per = 8 / bd;
  const sample = bd >= 8
    ? (y, k) => px[y * stride + k * (bd / 8)]
    : (y, k) => (px[y * stride + Math.floor(k / per)] >> (8 - bd * (k % per + 1))) & max;
  // Grey below 8 bits scales to the full 0..255 range; palette indices stay as they are.
  const grey = v => (bd < 8 ? Math.round(v * 255 / max) : v);
  const out = new Uint8Array(w * h * 4);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const s = x * ch;
    let r, g, b, a = 255;
    if (ct === 6) { r = sample(y, s); g = sample(y, s + 1); b = sample(y, s + 2); a = sample(y, s + 3); }
    else if (ct === 2) { r = sample(y, s); g = sample(y, s + 1); b = sample(y, s + 2); }
    else if (ct === 0) { r = g = b = grey(sample(y, s)); }
    else if (ct === 4) { r = g = b = sample(y, s); a = sample(y, s + 1); }
    else { const k = sample(y, s); r = plte[k * 3] ?? 0; g = plte[k * 3 + 1] ?? 0; b = plte[k * 3 + 2] ?? 0; a = trns && k < trns.length ? trns[k] : 255; }
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = a;
  }
  return { w, h, px: out };
}

const crcT = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = crcT[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function chunk(type, d) {
  const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function encode(w, h, colorType, channels, rows) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([Buffer.from(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

/** 8-bit grayscale PNG from floats in [0, 1] (clamped). */
export function encodeGray(w, h, data) {
  const rows = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    rows[y * (w + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(data[y * w + x] * 255)));
  }
  return encode(w, h, 0, 1, rows);
}

/** 8-bit RGBA PNG from a Uint8Array of w*h*4 bytes. */
export function encodeRGBA(w, h, data) {
  const rows = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w * 4; x++) rows[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
  }
  return encode(w, h, 6, 4, rows);
}
