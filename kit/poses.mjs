// Pose library. A pose is a plain object: humanoid bone name -> [x, y, z] Euler
// radians (applied on top of the model's rest pose). Positive Z lowers the left
// arm from the T-pose, negative Z lowers the right one; the same sign rule
// curls the fingers. Swinging an upper arm forward is -Y on the left and +Y on
// the right.

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];

// Hand shapes: curl angles (proximal, intermediate, distal) per finger plus the
// three thumb joints, written for a left hand. Right hands are mirrored.
const hand = (curl, thumb, overrides = {}) => ({
  Index: curl, Middle: curl, Ring: curl, Little: curl, thumb, ...overrides,
});
const FIST = [1.4, 1.55, 1.1];
const FIST_THUMB = [[0, 0.8, 0.3], [0, 0.6, 0], [0, 0.5, 0]];

export const HANDS = {
  open: hand([0.05, 0.05, 0.05], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]),
  relaxed: hand([0.35, 0.4, 0.3], [[0, 0.3, 0.15], [0, 0.15, 0], [0, 0.15, 0]]),
  fist: hand(FIST, FIST_THUMB),
  point: hand(FIST, FIST_THUMB, { Index: [0.05, 0.05, 0.05] }),
  grip: hand([0.9, 1.0, 0.7], [[0, 0.6, 0.2], [0, 0.4, 0], [0, 0.4, 0]]),
};

function handBones(side, shape) {
  const s = side === 'left' ? 1 : -1, o = {};
  for (const f of FINGERS) {
    const [a, b, c] = shape[f];
    o[side + f + 'Proximal'] = [0, 0, s * a];
    o[side + f + 'Intermediate'] = [0, 0, s * b];
    o[side + f + 'Distal'] = [0, 0, s * c];
  }
  ['Proximal', 'Intermediate', 'Distal'].forEach((j, k) => {
    const [x, y, z] = shape.thumb[k];
    o[side + 'Thumb' + j] = [x, s * y, s * z];
  });
  return o;
}

/** Replace the finger bones of a pose. left/right are HANDS names or hand shapes. */
export function withHands(pose, { left, right } = {}) {
  const out = { ...pose };
  for (const [side, h] of [['left', left], ['right', right]]) {
    if (h === undefined) continue;
    const shape = typeof h === 'string' ? HANDS[h] : h;
    if (!shape) throw new Error(`unknown hand shape: ${h}`);
    Object.assign(out, handBones(side, shape));
  }
  return out;
}

const swapSide = name => name.startsWith('left') ? 'right' + name.slice(4) : name.startsWith('right') ? 'left' + name.slice(5) : name;

/** Mirror a pose left to right: swap sides and negate the Y and Z rotations. */
export function mirrorPose(pose) {
  const out = {};
  for (const [bone, r] of Object.entries(pose)) {
    out[swapSide(bone)] = r.length === 4 ? [-r[0], r[1], r[2], r[3]] : [r[0], -r[1], -r[2]];
  }
  return out;
}

/** Blend two poses by t in [0, 1]; a bone missing from one pose counts as zero rotation. */
export function mixPose(a, b, t) {
  const out = {};
  for (const bone of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const p = a[bone] || [0, 0, 0], q = b[bone] || [0, 0, 0];
    out[bone] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
}

const both = (pose, hands) => withHands(pose, { left: hands, right: hands });

const stand = both({
  leftUpperArm: [0, 0, 1.2], rightUpperArm: [0, 0, -1.2],
  leftLowerArm: [0, -0.3, 0], rightLowerArm: [0, 0.3, 0],
  spine: [0.04, 0, 0], head: [-0.12, 0.1, 0],
}, 'relaxed');

const relaxed = both({
  leftUpperArm: [0, 0.05, 1.1], rightUpperArm: [0, -0.05, -1.1],
  leftLowerArm: [0, -0.2, 0], rightLowerArm: [0, 0.2, 0],
  hips: [0, 0.05, 0.02], spine: [0.03, -0.05, 0], head: [-0.05, -0.12, 0.05],
  rightUpperLeg: [0.06, 0, 0.02], rightLowerLeg: [-0.1, 0, 0],
}, 'relaxed');

const guardLeft = {
  leftUpperArm: [0.9, 0, 1.1], leftLowerArm: [0, -1.9, 0],
  rightUpperArm: [0.7, 0, -1.0], rightLowerArm: [0, 1.7, 0],
  spine: [0.1, 0.2, 0], head: [0.12, -0.2, 0],
  leftUpperLeg: [0.3, 0, -0.12], leftLowerLeg: [-0.25, 0, 0],
  rightUpperLeg: [-0.2, 0, 0.12], rightLowerLeg: [-0.2, 0, 0],
};

const reach = {
  rightUpperArm: [0, 1.45, 0.25], rightLowerArm: [0, 0.15, 0],
  leftUpperArm: [0, 0, 1.2], leftLowerArm: [0, -0.3, 0],
  spine: [0.12, -0.15, 0], head: [-0.08, 0.1, 0],
  rightUpperLeg: [0.15, 0, 0], leftUpperLeg: [-0.1, 0, 0], leftLowerLeg: [-0.1, 0, 0],
};

const walk = {
  leftUpperLeg: [0.4, 0, 0], leftLowerLeg: [-0.12, 0, 0],
  rightUpperLeg: [-0.3, 0, 0], rightLowerLeg: [-0.6, 0, 0],
  leftUpperArm: [0, 0.4, 1.2], leftLowerArm: [0, -0.25, 0],
  rightUpperArm: [0, 0.4, -1.2], rightLowerArm: [0, 0.6, 0],
  spine: [0.04, 0.12, 0], head: [-0.04, -0.1, 0],
};

const run = {
  leftUpperLeg: [0.95, 0, 0], leftLowerLeg: [-0.6, 0, 0],
  rightUpperLeg: [-0.55, 0, 0], rightLowerLeg: [-1.7, 0, 0],
  leftUpperArm: [0, 0.7, 1.0], leftLowerArm: [0, -1.5, 0],
  rightUpperArm: [0, 0.8, -1.0], rightLowerArm: [0, 1.6, 0],
  spine: [0.3, 0.2, 0], head: [-0.2, -0.2, 0],
};

// Seated: lower the model by about 0.45 m with the root transform.
const sit = {
  leftUpperLeg: [1.5, 0, 0.05], leftLowerLeg: [-1.5, 0, 0],
  rightUpperLeg: [1.5, 0, -0.05], rightLowerLeg: [-1.5, 0, 0],
  leftUpperArm: [0.5, 0, 1.0], leftLowerArm: [0, -0.7, 0],
  rightUpperArm: [0.5, 0, -1.0], rightLowerArm: [0, 0.7, 0],
  spine: [-0.05, 0, 0], head: [0.1, 0, 0],
};

export const POSES = {
  tpose: both({}, 'open'),
  stand,
  relaxed,
  guard: both(guardLeft, 'fist'),
  reach: withHands(reach, { left: 'relaxed', right: 'open' }),
  walk: both(walk, 'relaxed'),
  run: both(run, 'fist'),
  sit: both(sit, 'relaxed'),
};
