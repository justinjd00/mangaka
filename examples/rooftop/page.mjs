// Rooftop: a quiet five-panel dialogue page. Two classmates meet at the roof
// railing at dusk; she tells him she is moving away. Establishing shot, two
// singles, an over-the-shoulder shot and a silent close-up.
import { definePage } from '../../kit/page.mjs';
import { POSES } from '../../kit/poses.mjs';
import { gradient } from '../../kit/backgrounds.mjs';
import { caption, bubble } from '../../kit/lettering.mjs';
import { buildRoof } from './roof.mjs';

const boyModel = '../../models/fumiriya.vrm';
const girlModel = '../../models/shino.vrm';
const roof = buildRoof(), near = buildRoof({ skyline: false });

// They stand a step in front of the railing, turned towards each other and a little towards us.
const boyRoot = { pos: [-0.5, 0, 0.05], yaw: 1.3 };
const girlRoot = { pos: [0.5, 0, 0.05], yaw: -1.3 };
const boyPose = { ...POSES.stand, head: [-0.05, 0.05, 0] };
const girlPose = { ...POSES.relaxed, head: [0.05, 0.12, -0.04] };
const boy = (expr = {}) => ({ name: 'boy', model: boyModel, pose: boyPose, root: boyRoot, expr });
const girl = (expr = {}) => ({ name: 'girl', model: girlModel, pose: girlPose, root: girlRoot, expr });

// Low sun from the right, in front of the roof; long shadows over the floor.
const dusk = { dir: [0.65, 0.4, 0.62], target: [0, 1, 0], scale: 200, bias: 0.02 };
// Close shots cheat a softer light onto the face from the camera side.
// target: what the shadow map is centred on; it covers 1100 / scale metres.
const faceLight = (yaw, target, side = 0.3, scale = 700) => {
  const v = [Math.sin(yaw) + Math.cos(yaw) * side, 0.55, Math.cos(yaw) - Math.sin(yaw) * side], l = Math.hypot(...v);
  return { dir: v.map(c => c / l), target, scale, bias: 0.006 };
};
const girlHead = [0.5, 1.3, 0.05], boyHead = [-0.5, 1.4, 0.05];
const sky = gradient(0.52, 0);
const up = (p, d) => [p[0], p[1] + d, p[2]];

export default definePage({
  size: [900, 1280], reading: 'rtl', style: 'tone-soft', title: 'Rooftop',
  panels: [
    { id: 'roof', rect: [16, 16, 868, 410], ss: 1.3, scene: roof,
      actors: [boy(), girl()],
      camera: { yaw: 0.05, pitch: 0.14, scale: 150, target: [0, 1.1, -0.4] },
      background: sky, light: dusk },
    { id: 'her', rect: [458, 440, 426, 380], ss: 1.4, scene: near,
      actors: [girl({ sorrow: 0.55 })],
      camera: ({ bones }) => ({ yaw: girlRoot.yaw + 0.6, pitch: 0.02, scale: 640, cx: 250, target: up(bones.girl.neck, 0.02) }),
      background: sky, light: faceLight(girlRoot.yaw + 0.6, girlHead) },
    { id: 'him', rect: [16, 440, 426, 380], ss: 1.4, scene: near,
      actors: [boy({ surprised: 0.9 })],
      camera: ({ bones }) => ({ yaw: boyRoot.yaw - 0.6, pitch: 0.02, scale: 640, cx: 180, target: up(bones.boy.neck, 0.02) }),
      background: sky, light: faceLight(boyRoot.yaw - 0.6, boyHead, -0.3) },
    { id: 'over', rect: [330, 834, 554, 430], ss: 1.3, scene: roof,
      actors: [boy(), girl({ joy: 0.35, sorrow: 0.25 })],
      camera: ({ bones }) => ({ yaw: girlRoot.yaw + 0.22, pitch: 0.05, scale: 420, cx: 330, cy: 210, target: up(bones.girl.neck, 0.0) }),
      background: sky, light: faceLight(girlRoot.yaw + 0.22, [0, 1.2, 0.05], 0.3, 380) },
    { id: 'close', rect: [16, 834, 300, 430], ss: 1.5, scene: near,
      actors: [girl({ fun: 0.7 })],
      camera: ({ bones }) => ({ yaw: girlRoot.yaw + 0.85, pitch: -0.04, scale: 1250, cx: 170, cy: 190, target: up(bones.girl.head, 0.05) }),
      background: sky, light: faceLight(girlRoot.yaw + 0.7, girlHead), shade: { aoRadius: 0.02 } },
  ],
  lettering: [
    caption({ panel: 'roof', text: 'After the last bell, the roof is always empty.', at: [0.66, 0.04], width: 270 }),
    bubble({ panel: 'her', kind: 'speech', text: "I'm moving away. On Sunday.", at: [0.22, 0.18], tail: { actor: 'girl', bone: 'head' } }),
    bubble({ panel: 'him', kind: 'speech', text: '...This Sunday?', at: [0.78, 0.16], tail: { actor: 'boy', bone: 'head' } }),
    bubble({ panel: 'over', kind: 'speech', text: 'Mm. So stay a little. The lights are coming on.', at: [0.74, 0.155], tail: { actor: 'girl', bone: 'head' } }),
  ],
});
