// The knight and the broken gate of the example page, assembled from the parts
// library (kit/parts). Every part is named under `knight.` or `gate.`.
import * as S from '../../kit/sdf.mjs';
import { greatHelm, breastplate, pauldron, fauld, gauntlet, greave, sabaton, heaterShield, cape } from '../../kit/parts/armor.mjs';
import { poleaxe, sword, arrow } from '../../kit/parts/weapons.mjs';
import { column, rubble, ground } from '../../kit/parts/architecture.mjs';
import { alignY, lerp3, nrm } from '../../kit/parts/util.mjs';

const { hypot } = Math;

export function buildKnight() {
  const sc = S.scene();

  // Ground, rubble, arrows stuck in the ground and a sword thrust into it.
  ground(sc, 'gate.ground', { at: [0, 0, 0.15], size: [3.2, 0.62, 2.4] });
  rubble(sc, 'gate.rubble', { seed: ['gate', 'rubble'] });
  arrow(sc, 'gate.arrow.a', { tip: [-0.78, -0.05, 0.42], nock: [-0.86, 0.62, 0.36], head: false });
  arrow(sc, 'gate.arrow.b', { tip: [-0.66, -0.05, 0.6], nock: [-0.6, 0.5, 0.52], head: false });
  arrow(sc, 'gate.arrow.c', { tip: [0.86, -0.08, -0.05], nock: [0.95, 0.6, -0.12], head: false });
  arrow(sc, 'gate.arrow.d', { tip: [0.22, -0.08, -0.72], nock: [0.14, 0.52, -0.78], head: false });
  {
    // Tip down: the guard sits where it did on the old broken blade.
    const c = [0.8, 0.2, 0.5], R = S.mmul(S.rotZ(-0.28), S.rotY(0.5)), down = S.mmul(R, S.rotZ(Math.PI));
    const g = S.mapply(R, [0.02, 0.26 + 0.07 + 0.011, 0]);
    sword(sc, 'gate.sword', { at: [c[0] + g[0], c[1] + g[1], c[2] + g[2]], R: down, blade: 0.6, width: 0.026, guard: 0.03, grip: 0.14 });
  }

  // Broken columns.
  column(sc, 'gate.column.a', { base: [-1.02, -0.06, -1.0], h: 1.45, r: 0.17, tilt: 0.02, broken: true });
  column(sc, 'gate.column.b', { base: [0.42, -0.1, -1.35], h: 2.05, r: 0.19, tilt: -0.03, broken: true });
  column(sc, 'gate.column.c', { base: [-0.25, -0.12, -1.9], h: 0.7, r: 0.17, tilt: 0.0, broken: true });

  // Body armour.
  cape(sc, 'knight.cape');
  breastplate(sc, 'knight.torso');
  greatHelm(sc, 'knight.helm');
  pauldron(sc, 'knight.pauldron.r', { side: -1 });
  pauldron(sc, 'knight.pauldron.l', { side: 1 });
  fauld(sc, 'knight.waist');
  greave(sc, 'knight.leg.r', { side: -1, hip: [-0.108, 0.955, 0.0], knee: [-0.175, 0.535, 0.085], ankle: [-0.215, 0.1, 0.03] });
  sabaton(sc, 'knight.leg.r.sabaton', { ankle: [-0.215, 0.1, 0.03], toe: [-0.35, 0, 1] });
  greave(sc, 'knight.leg.l', { side: 1, hip: [0.108, 0.955, 0.0], knee: [0.125, 0.525, 0.005], ankle: [0.15, 0.1, -0.06] });
  sabaton(sc, 'knight.leg.l.sabaton', { ankle: [0.15, 0.1, -0.06], toe: [0.4, 0, 1] });

  // Poleaxe in the right hand.
  const hb = [-0.432, -0.02, 0.165], ht = [-0.416, 2.26, 0.12];
  poleaxe(sc, 'knight.axe', { at: hb, R: alignY([ht[0] - hb[0], ht[1] - hb[1], ht[2] - hb[2]]), length: hypot(ht[0] - hb[0], ht[1] - hb[1], ht[2] - hb[2]) });
  const haftAt = y => lerp3(hb, ht, (y - hb[1]) / (ht[1] - hb[1]));
  gauntlet(sc, 'knight.arm.r', {
    side: -1, shoulder: [-0.238, 1.53, 0], elbow: [-0.385, 1.24, -0.07],
    grip: { at: haftAt(1.365), axis: nrm([ht[0] - hb[0], ht[1] - hb[1], ht[2] - hb[2]]) },
  });

  // Left arm behind the shield.
  gauntlet(sc, 'knight.arm.l', { side: 1, shoulder: [0.238, 1.53, 0], elbow: [0.365, 1.25, -0.03], wrist: [0.4, 1.08, 0.15], detail: false });
  heaterShield(sc, 'knight.shield', { at: [0.45, 1.03, 0.25], yaw: 0.5 });

  return sc;
}
