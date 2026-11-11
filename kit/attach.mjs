// Attach code-built props to a posed actor's bones, or place a builder's output
// with any rigid frame.
//
// A frame is { origin: [x, y, z], R: row-major 3x3 } and maps a local point v
// to the world point origin + R v (the columns of R are the local axes in
// world space), the convention of kit/sdf.mjs mmul/mapply.
//
// Hand bones of the bundled VRM models (checked on fumiriya and shino, in any
// pose; the bone origin is the wrist):
//   rightHand: +X runs along the fingers, -Y is the palm normal, -Z points to
//              the thumb side (index finger), +Z to the little finger.
//   leftHand:  -X runs along the fingers, -Y is the palm normal, -Z points to
//              the thumb side, +Z to the little finger.
// A sword grip of radius 0.0115 held in a right hand closed with HANDS.hilt
// sits at [0.065, -0.032, 0] in the hand frame (between the palm and the curled
// fingers, checked on mesh cross-sections and close-up renders of fumiriya),
// running along Z, with the blade leaving the thumb side towards -Z: place the
// sword with at [0.065, -0.032, 0], R rotX(-PI / 2) and gripR 0.0115. Bones-only poses (poseVRM skin: false) are enough here.
import * as S from './sdf.mjs';

const isPoint = v => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number');

/**
 * The world frame of a humanoid bone after the flip and root transform:
 * { origin, R }. `result` is what poseVRM returned (it needs bonePos and boneRot).
 * `model` is only used to list the known bones in the error and may be null;
 * pass null from a scene function so a cached build never loads the model.
 */
export function boneFrame(model, result, bone) {
  const origin = result?.bonePos?.[bone], R = result?.boneRot?.[bone];
  if (!origin || !R) {
    const known = model?.bones ? ` (known: ${Object.keys(model.bones).join(', ')})` : '';
    throw new Error(`boneFrame: no bone "${bone}" in the pose result${known}`);
  }
  return { origin: [...origin], R: [...R] };
}

/** A frame moved by `offset` (in the frame's local axes) and turned by `R` (applied in local space). */
export const frameOffset = (frame, offset = [0, 0, 0], R = null) => ({
  origin: toWorld(frame, offset),
  R: R ? S.mmul(frame.R, R) : [...frame.R],
});

/** A local point in world space. */
export const toWorld = (frame, v) => {
  const w = S.mapply(frame.R, v);
  return [frame.origin[0] + w[0], frame.origin[1] + w[1], frame.origin[2] + w[2]];
};

/** Every point in a builder's return value (also inside arrays and objects) mapped to world space. */
function mapAnchors(v, frame) {
  if (isPoint(v)) return toWorld(frame, v);
  if (Array.isArray(v)) return v.map(x => mapAnchors(x, frame));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapAnchors(x, frame)]));
  return v;
}

/**
 * Run build(local) on a fresh scene whose coordinates are the frame's local
 * space, then add its parts and decals to `sc` in world space: each form is
 * wrapped in xform, each decal point is transformed. Part names and options
 * are kept. Returns build's return value with every [x, y, z] point in it
 * mapped to world space.
 */
export function attachTo(sc, frame, build) {
  const local = S.scene();
  const anchors = build(local);
  const { origin, R } = frame;
  for (const q of local.parts) {
    const { name, mat, sdf, hash, ...opts } = q;
    void hash;
    sc.add(name, mat, S.xform(sdf, [0, 0, 0], R, origin), opts);
  }
  const P = p => (p ? toWorld(frame, p) : p);
  for (const d of local.decals) {
    if (d.type === 'rivet' || d.type === 'hole') sc.decals.push({ ...d, p: P(d.p) });
    else sc.decals.push({ ...d, pts: d.pts.map(P) });
  }
  return mapAnchors(anchors, frame);
}

/**
 * Build in a local frame placed at `at` and turned by `R` (both optional). With
 * neither, build runs straight on `sc` and its anchors are returned as they are.
 */
export function placed(sc, { at = null, R = null } = {}, build) {
  if (!at && !R) return build(sc);
  return attachTo(sc, { origin: at ?? [0, 0, 0], R: R ?? [1, 0, 0, 0, 1, 0, 0, 0, 1] }, build);
}
