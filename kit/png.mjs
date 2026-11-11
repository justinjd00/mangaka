import zlib from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

/** Decode a PNG (colour types 0, 2, 3, 4, 6; depth 8 or 16) to RGBA bytes. */
export function decodePNG(buf) {
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
  if (il) throw new Error('interlaced PNG not supported');
  const ch = [1, 0, 3, 1, 2, 0, 4][ct], bps = bd / 8, bpp = Math.max(1, ch * bps), stride = Math.ceil(w * ch * bd / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], ro = y * (stride + 1) + 1, po = y * stride, pp = po - stride;
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
  // 16-bit samples keep their high byte (big-endian, first byte of each sample).
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const s = i * ch * bps;
    let r, g, b, a = 255;
    if (ct === 6) { r = px[s]; g = px[s + bps]; b = px[s + 2 * bps]; a = px[s + 3 * bps]; }
    else if (ct === 2) { r = px[s]; g = px[s + bps]; b = px[s + 2 * bps]; }
    else if (ct === 0) { r = g = b = px[s]; }
    else if (ct === 4) { r = g = b = px[s]; a = px[s + bps]; }
    else { const k = px[i]; r = plte[k * 3]; g = plte[k * 3 + 1]; b = plte[k * 3 + 2]; a = trns && k < trns.length ? trns[k] : 255; }
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
