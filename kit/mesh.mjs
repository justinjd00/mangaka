// Triangle rasteriser for posed VRM meshes: part id, depth, position, normal
// and texture luminance buffers. Larger depth is nearer to the viewer.
const { min, max, floor } = Math;

/**
 * idOf(prim, mat) returns a 1-based part id, or 0 to skip the primitive.
 * Textures are sampled when wantColor is set or the material is alpha-cut.
 */
export function rasterMesh(model, posed, cam, idOf, wantColor = true) {
  const { W, H, scale: s, cx, cy, right, up, fwd, target } = cam;
  const N = W * H;
  const id = new Int16Array(N), depth = new Float32Array(N).fill(-1e9);
  const pos = new Float32Array(N * 3), wn = new Float32Array(N * 3), lum = new Float32Array(N).fill(1);
  for (const { prim, wp, wn: vn } of posed) {
    const mat = model.materials[prim.mat];
    const pid = idOf(prim, mat);
    if (!pid) continue;
    const tex = wantColor || mat.alpha !== 'opaque' ? model.texture(mat.tex) : null;
    const cut = mat.alpha === 'opaque' ? -1 : mat.alpha === 'cut' ? 128 : 96;
    const vc = wp.length / 3;
    const sx = new Float32Array(vc), sy = new Float32Array(vc), sz = new Float32Array(vc);
    for (let v = 0; v < vc; v++) {
      const rx = wp[v * 3] - target[0], ry = wp[v * 3 + 1] - target[1], rz = wp[v * 3 + 2] - target[2];
      sx[v] = cx + s * (rx * right[0] + ry * right[1] + rz * right[2]);
      sy[v] = cy - s * (rx * up[0] + ry * up[1] + rz * up[2]);
      sz[v] = rx * fwd[0] + ry * fwd[1] + rz * fwd[2];
    }
    const ix = prim.idx, uv = prim.uv;
    // Render-queue bias: later queues (eyes, lashes, brows) win over the face they sit on.
    const bias = (mat.rq - 2000) * 2e-7;
    for (let t = 0; t < ix.length; t += 3) {
      const a = ix[t], b = ix[t + 1], c = ix[t + 2];
      const x0 = sx[a], y0 = sy[a], x1 = sx[b], y1 = sy[b], x2 = sx[c], y2 = sy[c];
      const minx = max(0, floor(min(x0, x1, x2))), maxx = min(W - 1, floor(max(x0, x1, x2)));
      const miny = max(0, floor(min(y0, y1, y2))), maxy = min(H - 1, floor(max(y0, y1, y2)));
      if (minx > maxx || miny > maxy) continue;
      const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(area) < 1e-9) continue;
      const ia = 1 / area;
      for (let py = miny; py <= maxy; py++) for (let px = minx; px <= maxx; px++) {
        const qx = px + 0.5, qy = py + 0.5;
        const w0 = ((x1 - qx) * (y2 - qy) - (x2 - qx) * (y1 - qy)) * ia;
        const w1 = ((x2 - qx) * (y0 - qy) - (x0 - qx) * (y2 - qy)) * ia;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
        const z = w0 * sz[a] + w1 * sz[b] + w2 * sz[c] + bias;
        const i = py * W + px;
        if (z <= depth[i]) continue;
        let L = 1;
        if (tex) {
          let u = w0 * uv[a * 2] + w1 * uv[b * 2] + w2 * uv[c * 2], v = w0 * uv[a * 2 + 1] + w1 * uv[b * 2 + 1] + w2 * uv[c * 2 + 1];
          u -= floor(u); v -= floor(v);
          const ti = (min(tex.h - 1, floor(v * tex.h)) * tex.w + min(tex.w - 1, floor(u * tex.w))) * 4;
          if (cut >= 0 && tex.px[ti + 3] * mat.color[3] < cut) continue;
          L = (0.299 * tex.px[ti] + 0.587 * tex.px[ti + 1] + 0.114 * tex.px[ti + 2]) / 255;
        }
        depth[i] = z; id[i] = pid; lum[i] = L;
        for (let k = 0; k < 3; k++) {
          pos[i * 3 + k] = w0 * wp[a * 3 + k] + w1 * wp[b * 3 + k] + w2 * wp[c * 3 + k];
          wn[i * 3 + k] = w0 * vn[a * 3 + k] + w1 * vn[b * 3 + k] + w2 * vn[c * 3 + k];
        }
      }
    }
  }
  return { id, depth, pos, wn, lum, W, H };
}
