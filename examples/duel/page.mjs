// Duel: an action page at the broken gate. The boy charges the knight with a
// sword in his right hand (attached to the hand bone, so it follows the pose),
// strikes the shield and shouts. Two diagonal panels open the page.
import * as S from '../../kit/sdf.mjs';
import { definePage } from '../../kit/page.mjs';
import { POSES, withHands } from '../../kit/poses.mjs';
import { boneFrame, attachTo } from '../../kit/attach.mjs';
import { sword } from '../../kit/parts/weapons.mjs';
import { focusLines, speedLines, flat } from '../../kit/backgrounds.mjs';
import { bubble, sfx } from '../../kit/lettering.mjs';
import { buildKnight } from '../gate/knight.mjs';

const model = '../../models/fumiriya.vrm';

// Height of the gate's earth mound at (x, z), so the boy stands on it.
const groundAt = (x, z) => -0.62 + 0.62 * Math.sqrt(Math.max(0, 1 - (x / 3.2) ** 2 - ((z - 0.15) / 2.4) ** 2));

// The sword sits across the curled fingers of the right hand; its blade leaves the thumb side (see kit/attach.mjs).
const GRIP = { at: [0.08, -0.012, 0], R: S.rotX(-Math.PI / 2) };
const withSword = sc => ({ actors }) => {
  const out = sc ? sc() : S.scene();
  attachTo(out, boneFrame(actors.boy.model, actors.boy.result, 'rightHand'), local => sword(local, 'boy.sword', GRIP));
  return out;
};

// Arm poses found by fitting the hand and blade direction.
const ready = { rightUpperArm: [0.15, 0.46, -1.45], rightLowerArm: [0, 0.17, 0], rightHand: [-0.13, 0.03, 0.28] };
const strike = { rightUpperArm: [-0.67, 0.98, -1.5], rightLowerArm: [0, 0.07, 0], rightHand: [0.59, -0.66, -0.57] };
const { rightUpperArm, rightLowerArm, ...runBody } = POSES.run;
void rightUpperArm; void rightLowerArm;
const charge = withHands({ ...runBody, ...ready, head: [0.05, 0, 0] }, { left: 'fist', right: 'grip' });
const hit = withHands({ ...POSES.stand, ...strike, leftUpperArm: [0.3, -0.4, 1.0], leftLowerArm: [0, -0.9, 0], head: [0.1, 0.1, 0],
  leftUpperLeg: [0.45, 0, -0.1], leftLowerLeg: [-0.5, 0, 0], rightUpperLeg: [-0.35, 0, 0.12], rightLowerLeg: [-0.15, 0, 0] }, { left: 'fist', right: 'grip' });

// The strike lands on the shield's upper rim: the boy stands 1.215 m out along the shield's facing.
const n = [Math.sin(0.5), 0, Math.cos(0.5)];
const hitPos = [0.45 + n[0] * 1.215, 0, 0.25 + n[2] * 1.215];
hitPos[1] = groundAt(hitPos[0], hitPos[2]);
const hitRoot = { pos: hitPos, yaw: Math.atan2(-n[0], -n[2]) };
const runRoot = { pos: [1.9, 0, 2.3], yaw: Math.atan2(-1.9, -2.15) };
const clashAt = [0.32, 1.29, 0.32];

const lightFor = (yaw, side = -0.45, upk = 0.55) => {
  const v = [Math.sin(yaw) + Math.cos(yaw) * side, upk, Math.cos(yaw) - Math.sin(yaw) * side], l = Math.hypot(...v);
  return v.map(c => c / l);
};

export default definePage({
  size: [900, 1280], reading: 'rtl', style: 'shonen-clean', title: 'Duel',
  panels: [
    { id: 'charge', rect: [392, 16, 492, 450], clip: [[512, 16], [884, 16], [884, 466], [392, 466]], ss: 1.4,
      scene: withSword(null),
      actors: [{ name: 'boy', model, pose: charge, root: runRoot, expr: { angry: 0.8, a: 0.3 } }],
      camera: ({ bones }) => ({ yaw: runRoot.yaw + 1.25, pitch: 0.06, scale: 250, cx: 290, cy: 250, target: [bones.boy.hips[0], 1.0, bones.boy.hips[2]] }),
      background: speedLines({ angle: 0.08, density: 0.6, pitch: 8, seed: 'charge' }),
      light: { dir: lightFor(runRoot.yaw + 1.25, -0.6), target: [1.9, 1, 2.3], scale: 300 } },
    { id: 'knight', rect: [16, 16, 484, 450], clip: [[16, 16], [500, 16], [380, 466], [16, 466]], ss: 1.3,
      scene: buildKnight(),
      camera: { yaw: 0.35, pitch: -0.18, scale: 190, cx: 215, cy: 235, target: [0.05, 1.12, 0] },
      background: focusLines({ cx: 215, cy: 140, r0: 150, density: 0.45, seed: 'knight' }) },
    { id: 'clash', rect: [16, 480, 868, 400], ss: 1.3,
      scene: withSword(buildKnight),
      actors: [{ name: 'boy', model, pose: hit, root: hitRoot, expr: { angry: 1, i: 0.4 } }],
      camera: { yaw: -0.75, pitch: 0.05, scale: 225, cx: 420, cy: 175, target: clashAt },
      background: focusLines({ cx: 420, cy: 175, r0: 120, count: 180, density: 0.6, seed: 'clash' }) },
    { id: 'shout', rect: [400, 894, 484, 370], ss: 1.5,
      scene: withSword(null),
      actors: [{ name: 'boy', model, pose: hit, root: hitRoot, expr: { angry: 1, a: 0.9 } }],
      camera: ({ bones }) => ({ yaw: hitRoot.yaw + 0.45, pitch: -0.06, scale: 1150, cx: 335, cy: 210, target: [bones.boy.head[0], bones.boy.head[1] + 0.04, bones.boy.head[2]] }),
      background: speedLines({ angle: 0.5, density: 0.5, pitch: 9, seed: 'shout' }),
      style: 'shonen-clean', shade: { aoRadius: 0.02 },
      light: { dir: lightFor(hitRoot.yaw + 0.45), target: hitPos.map((v, i) => (i === 1 ? 1.5 : v)), scale: 700, bias: 0.006 } },
    { id: 'helm', rect: [16, 894, 370, 370], ss: 1.4,
      scene: buildKnight(),
      camera: { yaw: 0.75, pitch: -0.25, scale: 720, cx: 175, cy: 205, target: [0, 1.76, 0.02] },
      background: flat(0.06) },
  ],
  lettering: [
    sfx({ panel: 'charge', text: 'Dash!', at: [0.12, 0.93], rotate: -8, size: 50 }),
    sfx({ panel: 'clash', text: 'Klang!!', at: [0.56, 0.3], rotate: -12, size: 64 }),
    bubble({ panel: 'shout', kind: 'shout', text: "I said I'm NOT running!", at: [0.3, 0.2], tail: { actor: 'boy', bone: 'head' } }),
    sfx({ panel: 'helm', text: 'Grrk...', at: [0.08, 0.92], rotate: -6, size: 40 }),
  ],
});
