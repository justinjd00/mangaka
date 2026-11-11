const { sqrt, floor, ceil, max, min, cos, sin, hypot } = Math;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function makeCam({ yaw = 0, pitch = 0, scale, cx, cy, W, H, target = [0, 0, 0] }) {
  const fwd = [sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)];
  const right = [cos(yaw), 0, -sin(yaw)];
  const up = cross(fwd, right);
  return { fwd, right, up, scale, cx, cy, W, H, target };
}
export function lightCam(dir, target, scale, size) {
  const fwd = norm(dir);
  const right = norm(cross([0, 1, 0], fwd));
  const up = cross(fwd, right);
  return { fwd, right, up, scale, cx: size / 2, cy: size / 2, W: size, H: size, target };
}
export function project(cam, p) {
  const r = [p[0] - cam.target[0], p[1] - cam.target[1], p[2] - cam.target[2]];
  return [cam.cx + cam.scale * dot(r, cam.right), cam.cy - cam.scale * dot(r, cam.up), dot(r, cam.fwd)];
}

export function rasterSDF(parts, cam, wantPos = true) {
  const { W, H, scale: s, cx, cy, right, up, fwd, target } = cam;
  const N = W * H;
  const id = new Int16Array(N);
  const depth = new Float32Array(N).fill(-1e9);
  const pos = wantPos ? new Float32Array(N * 3) : null;
  const eps = 0.4 / s;
  for (let pi = 0; pi < parts.length; pi++) {
    const f = parts[pi].sdf, b = f.b, st = f.st || 1;
    const rel = [b[0] - target[0], b[1] - target[1], b[2] - target[2]];
    const xc = dot(rel, right), yc = dot(rel, up), zc = dot(rel, fwd), R = b[3];
    const x0 = max(0, floor(cx + (xc - R) * s)), x1 = min(W - 1, ceil(cx + (xc + R) * s));
    const y0 = max(0, floor(cy - (yc + R) * s)), y1 = min(H - 1, ceil(cy - (yc - R) * s));
    for (let py = y0; py <= y1; py++) {
      const ycam = (cy - py - 0.5) / s, dy = ycam - yc;
      for (let px = x0; px <= x1; px++) {
        const xcam = (px + 0.5 - cx) / s, dx = xcam - xc;
        const rr = R * R - dx * dx - dy * dy;
        if (rr <= 0) continue;
        const zr = sqrt(rr);
        const idx = py * W + px;
        const zb = depth[idx];
        let z = zc + zr;
        const zend = zc - zr;
        if (z <= zb) continue;
        const bx = target[0] + xcam * right[0] + ycam * up[0];
        const by = target[1] + xcam * right[1] + ycam * up[1];
        const bz = target[2] + xcam * right[2] + ycam * up[2];
        for (let i = 0; i < 96; i++) {
          const wx = bx + z * fwd[0], wy = by + z * fwd[1], wz = bz + z * fwd[2];
          const d = f(wx, wy, wz);
          if (d < eps) {
            let dd = d, zz = z;
            for (let k = 0; k < 4 && Math.abs(dd) > eps * 0.04; k++) { zz -= dd * st; dd = f(bx + zz * fwd[0], by + zz * fwd[1], bz + zz * fwd[2]); }
            id[idx] = pi + 1; depth[idx] = zz;
            if (pos) { pos[idx * 3] = bx + zz * fwd[0]; pos[idx * 3 + 1] = by + zz * fwd[1]; pos[idx * 3 + 2] = bz + zz * fwd[2]; }
            break;
          }
          z -= max(d * st, eps * 0.5);
          if (z < zend || z <= zb) break;
        }
      }
    }
  }
  return { id, depth, pos, W, H };
}

export function normalsSDF(parts, cam, buf) {
  const { W, H } = buf, N = W * H;
  const nx = new Float32Array(N), ny = new Float32Array(N), nz = new Float32Array(N);
  const wn = new Float32Array(N * 3);
  const h = 0.0016;
  for (let i = 0; i < N; i++) {
    const p = buf.id[i];
    if (!p) continue;
    const f = parts[p - 1].sdf;
    const x = buf.pos[i * 3], y = buf.pos[i * 3 + 1], z = buf.pos[i * 3 + 2];
    const a = f(x + h, y - h, z - h), b = f(x - h, y - h, z + h), c = f(x - h, y + h, z - h), d = f(x + h, y + h, z + h);
    let gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d;
    const l = hypot(gx, gy, gz) || 1;
    gx /= l; gy /= l; gz /= l;
    wn[i * 3] = gx; wn[i * 3 + 1] = gy; wn[i * 3 + 2] = gz;
    nx[i] = gx * cam.right[0] + gy * cam.right[1] + gz * cam.right[2];
    ny[i] = gx * cam.up[0] + gy * cam.up[1] + gz * cam.up[2];
    nz[i] = gx * cam.fwd[0] + gy * cam.fwd[1] + gz * cam.fwd[2];
  }
  return { nx, ny, nz, wn };
}

export function shadowTerm(buf, lc, lbuf, bias = 0.02) {
  const { W, H } = buf, N = W * H;
  const sh = new Float32Array(N).fill(1);
  for (let i = 0; i < N; i++) {
    if (!buf.id[i]) continue;
    const p = [buf.pos[i * 3], buf.pos[i * 3 + 1], buf.pos[i * 3 + 2]];
    const q = project(lc, p);
    let lit = 0, n = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const sx = floor(q[0] + ox * 1.2), sy = floor(q[1] + oy * 1.2);
      n++;
      if (sx < 0 || sy < 0 || sx >= lc.W || sy >= lc.H) { lit++; continue; }
      if (q[2] >= lbuf.depth[sy * lc.W + sx] - bias) lit++;
    }
    sh[i] = lit / n;
  }
  return sh;
}

export function ambient(buf, nrm, scale, radiusPx = 16, samples = 20, far = 0.3) {
  const { W, H } = buf, N = W * H;
  const ao = new Float32Array(N).fill(1);
  const offs = [];
  for (let k = 0; k < samples; k++) {
    const a = k * 2.399963, r = radiusPx * sqrt((k + 0.5) / samples);
    offs.push([Math.round(cos(a) * r), Math.round(sin(a) * r)]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!buf.id[i]) continue;
    const d0 = buf.depth[i], nx = nrm.nx[i], ny = nrm.ny[i], nz = nrm.nz[i];
    let occ = 0;
    for (const [ox, oy] of offs) {
      const sx = x + ox, sy = y + oy;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const vz = buf.depth[sy * W + sx] - d0;
      if (vz < -0.5) continue;
      const vx = ox / scale, vy = -oy / scale;
      const l = hypot(vx, vy, vz);
      if (l > far || l < 1e-6) continue;
      const dn = (vx * nx + vy * ny + vz * nz) / l;
      if (dn > 0.2) occ += (dn - 0.2) * 1.25 * (1 - l / far);
    }
    ao[i] = 1 - min(1, occ / samples * 2.6);
  }
  return ao;
}
