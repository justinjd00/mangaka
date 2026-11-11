// The Gate: a four-panel example page. A knight stands in a ruined gate, a boy
// faces him, and the close-ups follow the boy's face, his fist and the knight's helm.
import { definePage } from '../../kit/page.mjs';
import { POSES } from '../../kit/poses.mjs';
import { storm, focusLines, speedLines, flat } from '../../kit/backgrounds.mjs';
import { rain } from '../../kit/effects.mjs';
import { caption, bubble, sfx } from '../../kit/lettering.mjs';
import { resolveStyle } from '../../kit/styles.mjs';
import { buildKnight } from './knight.mjs';

const model = '../../models/fumiriya.vrm';
const knight = buildKnight();

// The boy stands to the knight's right, turned towards him.
const root = { pos: [1.55, -0.03, 1.2], yaw: Math.atan2(-1.55, -1.2) + 0.3 };
const face = root.yaw;
const up = (p, d) => [p[0], p[1] + d, p[2]];

// Key light for a close-up, placed relative to the way the boy faces.
const lightFor = (yaw, side = -0.45, upk = 0.55) => {
  const f = [Math.sin(yaw), 0, Math.cos(yaw)], r = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const v = [f[0] + r[0] * side, upk, f[2] + r[2] * side], l = Math.hypot(...v);
  return v.map(c => c / l);
};
const closeLight = (yaw, target, side, upk) => ({ dir: lightFor(yaw, side, upk), target, scale: 700, bias: 0.006 });

const close = resolveStyle('seinen-dense', { depthK: 0.3, toneMats: ['sky', 'skin', 'tex', 'fabric'], balance: { black: [0.04, 0.6] } });
const tight = { aoRadius: 0.02 };

const stand = POSES.stand;
const fist = { ...stand, leftUpperArm: [0.9, 0, 1.1], leftLowerArm: [0, -1.9, 0] };

// Light tone behind the speaker on the left, black on the right.
const split = Object.assign((x, y, W, H) => (x > W * 0.56 ? 0.95 : 0.62 - 0.5 * (y / H)), { desc: { kind: 'resolveBackdrop', xFrac: 0.56, right: 0.95, top: 0.62, drop: 0.5 } });

export default definePage({
  size: [900, 1280], reading: 'rtl', style: 'seinen-dense', title: 'The Gate',
  panels: [
    { id: 'gate', rect: [16, 16, 868, 470], ss: 1.4, scene: knight,
      actors: [{ name: 'boy', model, pose: stand, root }],
      camera: { yaw: 0.35, pitch: 0.12, scale: 335, cx: 400, cy: 235, target: [0.28, 1.28, 0] },
      background: storm({ moon: [330, 170, 200], seed: 'gate' }),
      effects: [rain({ density: 0.9 })] },
    { id: 'shock', rect: [16, 500, 426, 380], ss: 1.5,
      actors: [{ name: 'boy', model, pose: stand, expr: { surprised: 1, a: 0.25 }, root }],
      camera: ({ bones }) => ({ yaw: face + 0.35, pitch: -0.05, scale: 1500, target: up(bones.boy.head, 0.055) }),
      background: focusLines({ cx: 213, cy: 170, r0: 130, seed: 'shock' }),
      style: close, shade: tight, light: closeLight(face + 0.35, [1.55, 1.4, 1.2]) },
    { id: 'grip', rect: [458, 500, 426, 380], ss: 1.5,
      actors: [{ name: 'boy', model, pose: fist, hands: { left: 'fist' }, root }],
      camera: ({ bones }) => ({ yaw: face - 0.5, pitch: 0.12, scale: 2050, target: up(bones.boy.leftHand, 0.02) }),
      background: speedLines({ angle: -0.5, density: 0.55, pitch: 9, seed: 'grip' }),
      style: close, shade: tight, light: closeLight(face - 0.5, [1.55, 1.2, 1.2]) },
    { id: 'resolve', rect: [16, 894, 868, 370], ss: 1.5,
      actors: [{ name: 'boy', model, pose: { ...fist, head: [0.02, -0.25, 0] }, hands: { left: 'fist' }, expr: { angry: 1, i: 0.5 }, root }],
      camera: ({ bones }) => ({ yaw: face - 0.55, pitch: -0.08, scale: 1450, cx: 300, target: up(bones.boy.head, 0.04) }),
      background: split, style: close, shade: tight, light: closeLight(face - 0.55, [1.55, 1.4, 1.2], -0.6, 0.5) },
    { id: 'helm', rect: [590, 936, 270, 286], ss: 1.4, inset: true, gutter: 7, frame: 3.2, scene: knight,
      camera: { yaw: 0.62, pitch: -0.16, scale: 780, cx: 135, cy: 150, target: [0, 1.775, 0.02] },
      background: flat(0.95), effects: [rain({ density: 0.8 })] },
  ],
  lettering: [
    caption({ panel: 'gate', text: 'Nine hundred years shut. Tonight, the gate opened.', at: [0.02, 0.034], width: 286 }),
    sfx({ panel: 'gate', text: 'Shaaaaa', at: [0.616, 0.26], rotate: 73, size: 40 }),
    bubble({ panel: 'shock', kind: 'speech', text: '...it moved?!', at: [0.19, 0.84], tail: [0.33, 0.78] }),
    sfx({ panel: 'grip', text: 'Grip!', at: [0.73, 0.16], rotate: -10, size: 46 }),
    bubble({ panel: 'resolve', kind: 'speech', text: "I'm not running.", at: [0.55, 0.77], tail: { actor: 'boy', bone: 'head' } }),
  ],
});
