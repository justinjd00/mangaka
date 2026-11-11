// VRM 0.x loader and skeletal posing: morph targets, linear blend skinning,
// a 180 degree flip so the model faces +Z, and an optional root transform.
import fs from 'node:fs';
import { decodePNG } from './png.mjs';

const { hypot, sin, cos } = Math;

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const ARRAYS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const READERS = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' };

const mul4 = (a, b) => {
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
};
const trs = (t, q, s) => {
  const [x, y, z, w] = q, m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0]; m[1] = 2 * (x * y + z * w) * s[0]; m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1]; m[5] = (1 - 2 * (x * x + z * z)) * s[1]; m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2]; m[9] = 2 * (y * z - x * w) * s[2]; m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
};
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
// Euler XYZ in radians, applied as Rz * Ry * Rx.
const qeuler = ([x, y, z]) => {
  const qx = [sin(x / 2), 0, 0, cos(x / 2)], qy = [0, sin(y / 2), 0, cos(y / 2)], qz = [0, 0, sin(z / 2), cos(z / 2)];
  return qmul(qz, qmul(qy, qx));
};

function materialClass(name) {
  if (/_HAIR/.test(name)) return 'hair';
  if (/_SKIN/.test(name)) return 'skin';
  if (/_CLOTH/.test(name)) return 'cloth';
  if (/_FACE|_EYE/.test(name)) return 'tex';
  return 'cloth';
}

/**
 * Load a VRM 0.x file. Textures and morph targets are decoded on first use:
 * model.texture(index) and model.morphTarget(prim, targetIndex).
 */
export function loadVRM(path) {
  const b = fs.readFileSync(path);
  if (b.length < 20 || b.toString('ascii', 0, 4) !== 'glTF') throw new Error('not a VRM file');
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  if (j.extensions?.VRMC_vrm) throw new Error('VRM 1.0 is not supported yet; export as VRM 0.x');
  const vrm = j.extensions?.VRM;
  if (!vrm) throw new Error('not a VRM file');
  const bin = b.subarray(20 + jl + 8);

  const accessor = i => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
    const n = COMPONENTS[a.type], T = ARRAYS[a.componentType];
    const es = T.BYTES_PER_ELEMENT * n, stride = bv.byteStride || es;
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new T(a.count * n);
    const dv = new DataView(bin.buffer, bin.byteOffset + off);
    const read = READERS[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[read](k * stride + c * T.BYTES_PER_ELEMENT, true);
    return out;
  };

  const texCache = new Map();
  const texture = ti => {
    if (ti === undefined || ti < 0) return null;
    const src = j.textures[ti].source;
    if (!texCache.has(src)) {
      const bv = j.bufferViews[j.images[src].bufferView];
      const o = bv.byteOffset || 0;
      texCache.set(src, decodePNG(bin.subarray(o, o + bv.byteLength)));
    }
    return texCache.get(src);
  };

  const materials = j.materials.map((m, i) => {
    const p = vrm.materialProperties?.[i] || {};
    const kw = Object.keys(p.keywordMap || {});
    return {
      name: m.name,
      cls: materialClass(m.name),
      alpha: kw.includes('_ALPHABLEND_ON') ? 'blend' : kw.includes('_ALPHATEST_ON') ? 'cut' : 'opaque',
      tex: m.pbrMetallicRoughness?.baseColorTexture?.index,
      color: m.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1],
      rq: p.renderQueue || 2000,
    };
  });

  const prims = [];
  j.nodes.forEach((n, node) => {
    if (n.mesh === undefined) return;
    const mesh = j.meshes[n.mesh];
    mesh.primitives.forEach((p, pi) => {
      const at = p.attributes;
      prims.push({
        index: prims.length, mesh: n.mesh, node, skin: n.skin, mat: p.material, name: mesh.name + '.' + pi,
        pos: accessor(at.POSITION), nrm: accessor(at.NORMAL), uv: accessor(at.TEXCOORD_0),
        jn: at.JOINTS_0 !== undefined ? accessor(at.JOINTS_0) : null,
        wt: at.WEIGHTS_0 !== undefined ? accessor(at.WEIGHTS_0) : null,
        idx: accessor(p.indices),
        targets: (p.targets || []).map(t => ({ position: t.POSITION, normal: t.NORMAL, data: null })),
      });
    });
  });

  const morphTarget = (prim, ti) => {
    const t = prim.targets[ti];
    t.data ??= { pos: accessor(t.position), nrm: t.normal !== undefined ? accessor(t.normal) : null };
    return t.data;
  };

  const skins = (j.skins || []).map(s => ({ joints: s.joints, ibm: accessor(s.inverseBindMatrices) }));
  const parent = new Int32Array(j.nodes.length).fill(-1);
  j.nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const bones = {};
  for (const hb of vrm.humanoid.humanBones) bones[hb.bone] = hb.node;
  const groups = {};
  for (const g of vrm.blendShapeMaster.blendShapeGroups) groups[g.name.toLowerCase()] = g.binds;

  return { j, vrm, materials, prims, skins, parent, bones, groups, texture, morphTarget, meta: vrm.meta };
}

/**
 * Pose a loaded model. pose maps humanoid bone names to Euler [x, y, z]
 * radians (or a quaternion [x, y, z, w]); expr maps blend shape names to
 * weights. Returns world-space vertices per primitive and bone positions.
 */
export function poseVRM(model, { pose = {}, expr = {}, root = null, flip = true } = {}) {
  const { j, parent, bones } = model;
  const n = j.nodes.length;
  const local = j.nodes.map(nd => ({ t: nd.translation || [0, 0, 0], q: nd.rotation || [0, 0, 0, 1], s: nd.scale || [1, 1, 1] }));
  for (const [bone, e] of Object.entries(pose)) {
    const ni = bones[bone];
    if (ni === undefined) continue;
    local[ni] = { ...local[ni], q: qmul(local[ni].q, e.length === 4 ? e : qeuler(e)) };
  }
  const world = new Array(n);
  const worldOf = i => {
    if (world[i]) return world[i];
    const m = trs(local[i].t, local[i].q, local[i].s);
    world[i] = parent[i] < 0 ? m : mul4(worldOf(parent[i]), m);
    return world[i];
  };
  for (let i = 0; i < n; i++) worldOf(i);

  const morphW = new Map();
  for (const [name, w] of Object.entries(expr)) for (const bnd of (model.groups[name.toLowerCase()] || [])) {
    const k = bnd.mesh + ':' + bnd.index;
    morphW.set(k, (morphW.get(k) || 0) + w * bnd.weight / 100);
  }

  const rc = root ? cos(root.yaw || 0) : 1, rs = root ? sin(root.yaw || 0) : 0;
  const posed = [];
  for (const p of model.prims) {
    const vc = p.pos.length / 3;
    let pos = p.pos, nrm = p.nrm, copied = false;
    p.targets.forEach((_, ti) => {
      const w = morphW.get(p.mesh + ':' + ti);
      if (!w) return;
      if (!copied) { pos = Float32Array.from(pos); nrm = Float32Array.from(nrm); copied = true; }
      const t = model.morphTarget(p, ti);
      for (let i = 0; i < pos.length; i++) { pos[i] += w * t.pos[i]; if (t.nrm) nrm[i] += w * t.nrm[i]; }
    });

    const wp = new Float32Array(vc * 3), wn = new Float32Array(vc * 3);
    const sk = p.skin !== undefined ? model.skins[p.skin] : null;
    const jm = sk ? sk.joints.map((jn, k) => mul4(world[jn], sk.ibm.subarray(k * 16, k * 16 + 16))) : null;
    const nodeM = world[p.node];
    for (let v = 0; v < vc; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], a = nrm[v * 3], b2 = nrm[v * 3 + 1], c = nrm[v * 3 + 2];
      let X = 0, Y = 0, Z = 0, A = 0, B = 0, C = 0;
      if (sk) {
        for (let k = 0; k < 4; k++) {
          const w = p.wt[v * 4 + k];
          if (!w) continue;
          const m = jm[p.jn[v * 4 + k]];
          X += w * (m[0] * x + m[4] * y + m[8] * z + m[12]); Y += w * (m[1] * x + m[5] * y + m[9] * z + m[13]); Z += w * (m[2] * x + m[6] * y + m[10] * z + m[14]);
          A += w * (m[0] * a + m[4] * b2 + m[8] * c); B += w * (m[1] * a + m[5] * b2 + m[9] * c); C += w * (m[2] * a + m[6] * b2 + m[10] * c);
        }
      } else {
        const m = nodeM;
        X = m[0] * x + m[4] * y + m[8] * z + m[12]; Y = m[1] * x + m[5] * y + m[9] * z + m[13]; Z = m[2] * x + m[6] * y + m[10] * z + m[14];
        A = m[0] * a + m[4] * b2 + m[8] * c; B = m[1] * a + m[5] * b2 + m[9] * c; C = m[2] * a + m[6] * b2 + m[10] * c;
      }
      const l = hypot(A, B, C) || 1;
      if (flip) { X = -X; Z = -Z; A = -A; C = -C; }
      if (root) {
        const x1 = X * rc + Z * rs, z1 = -X * rs + Z * rc, a1 = A * rc + C * rs, c1 = -A * rs + C * rc;
        X = x1 + root.pos[0]; Y += root.pos[1]; Z = z1 + root.pos[2]; A = a1; C = c1;
      }
      wp[v * 3] = X; wp[v * 3 + 1] = Y; wp[v * 3 + 2] = Z;
      wn[v * 3] = A / l; wn[v * 3 + 1] = B / l; wn[v * 3 + 2] = C / l;
    }
    posed.push({ prim: p, wp, wn });
  }

  const bonePos = {}, boneRot = {};
  for (const [bn, ni] of Object.entries(bones)) {
    const m = world[ni];
    let X = flip ? -m[12] : m[12], Y = m[13], Z = flip ? -m[14] : m[14];
    if (root) { const x1 = X * rc + Z * rs, z1 = -X * rs + Z * rc; X = x1 + root.pos[0]; Y += root.pos[1]; Z = z1 + root.pos[2]; }
    bonePos[bn] = [X, Y, Z];
    // Row-major 3x3 world rotation (columns are the bone's local axes), with the
    // same flip and root yaw as bonePos.
    const R = new Array(9);
    for (let c = 0; c < 3; c++) {
      let a = m[c * 4], b2 = m[c * 4 + 1], d = m[c * 4 + 2];
      const l = hypot(a, b2, d) || 1;
      a /= l; b2 /= l; d /= l;
      if (flip) { a = -a; d = -d; }
      if (root) { const a1 = a * rc + d * rs, d1 = -a * rs + d * rc; a = a1; d = d1; }
      R[c] = a; R[3 + c] = b2; R[6 + c] = d;
    }
    boneRot[bn] = R;
  }
  return { posed, bonePos, boneRot };
}

/**
 * Stable part names for a model: `<actor>.skin`, `<actor>.hair.<primitive index>`,
 * otherwise `<actor>.<short material name>` (prefix and class suffix removed).
 */
export function partNamer(actorName) {
  return (prim, mat) => {
    if (mat.cls === 'skin') return `${actorName}.skin`;
    if (mat.cls === 'hair') return `${actorName}.hair.${prim.index}`;
    const short = mat.name
      .replace(/^[A-Za-z]\d+_\d+_(\d+_)?/, '')
      .replace(/_\d+_(FACE|EYE|SKIN|CLOTH|HAIR)(_\d+)?$/, '');
    return `${actorName}.${short}`;
  };
}
