# Walkthrough: one page from beat to checked page

This follows `examples/rooftop/` from a one-line request to a page that passes every check. Open `examples/rooftop/page.mjs` and `roof.mjs` beside it. Paths are from the repository root; in a user's project, replace `examples/rooftop` with the page folder and `scripts/` with `<skill>/scripts/`.

## 1. Size it

The request: "a quiet manga page: two classmates on the school roof after class, she tells him she is moving away."

That is a **page**: five panels, two characters, one set. Say so, and say a cold build takes about a minute and a quarter.

## 2. Script first

The beat in one sentence: *she tells him she is moving away, and asks him to stay a little longer.* Then the page in words, before any geometry:

```text
1. roof   wide, slightly high. The empty roof at dusk, the two of them small at the railing.
          Caption: "After the last bell, the roof is always empty."
2. her    medium close, three-quarter. "I'm moving away. On Sunday."  sorrow
3. him    medium close, three-quarter, a little low. "...This Sunday?"  surprised
4. over   over his shoulder onto her. "Mm. So stay a little. The lights are coming on."  sad smile
5. close  extreme close on her face, no text.  a small smile
```

Checks on the script: three shot sizes (wide, medium close, extreme close); the biggest panel is the place; a silent panel after the last line; dialogue short and clipped. Reading order `rtl`, so panel 2 (her) sits to the right of panel 3 (him), and panel 4 to the right of panel 5.

## 3. Cast and set

Cast: `boy` is `models/fumiriya.vrm`, `girl` is `models/shino.vrm`. Expressions per panel are in the script.

Set: a school roof. Its parts list, written before the code:

- floor: a paved slab (`ground` with `slab: true`)
- far boundary: a parapet wall (`wall`) and a railing with bars on it (`railing`)
- objects that say "school roof": a water tank on legs with hoops, a lid and a ladder; the stairwell hut with its steel door
- beyond the railing: a city skyline of plain boxes with lit windows

`roof.mjs` builds it as `buildRoof({ skyline })`, with the tank and the hut written as small local builders in the same shape as the parts library (`(sc, prefix, params)`), every part named under `roof.` or `city.`:

```js
export function buildRoof({ skyline: city = true } = {}) {
  const sc = S.scene();
  ground(sc, 'roof.floor', { slab: true, at: [0, 0, 1.1], size: [4.6, 0.15, 1.72], rough: 0.012 });
  wall(sc, 'roof.parapet', { from: [-4.6, 0, EDGE], to: [4.6, 0, EDGE], height: 0.42, thick: 0.24 });
  railing(sc, 'roof.rail', { from: [-4.5, 0.42, EDGE], to: [4.5, 0.42, EDGE], height: 0.72, spacing: 1.5, rails: 1, bars: 0.15, r: 0.02 });
  waterTank(sc, 'roof.tank', { at: [-3.0, 0, 0.05] });
  stairHut(sc, 'roof.hut', { at: [3.6, 0, 0.35] });
  if (city) skyline(sc);
  return sc;
}
```

The skyline needs care because the camera is orthographic: far boxes do not shrink, so they are built low (tops 0.6 to 1.35 m above the roof). It is left out of the close panels (`skyline: false`) where it would only add clutter. Each block draws from its own random stream, `rngFor('rooftop', 'skyline', i)`, so changing one block leaves the others alone.

## 4. Block the scene

Both stand a step in front of the railing, turned towards each other and a little towards us. The light is a low sun from the right and in front, so shadows run long across the floor:

```js
const boyRoot = { pos: [-0.5, 0, 0.05], yaw: 1.3 };
const girlRoot = { pos: [0.5, 0, 0.05], yaw: -1.3 };
const boyPose = { ...POSES.stand, head: [-0.05, 0.05, 0] };
const girlPose = { ...POSES.relaxed, head: [0.05, 0.12, -0.04] };
const boy = (expr = {}) => ({ name: 'boy', model: boyModel, pose: boyPose, root: boyRoot, expr });
const girl = (expr = {}) => ({ name: 'girl', model: girlModel, pose: girlPose, root: girlRoot, expr });

const dusk = { dir: [0.65, 0.4, 0.62], target: [0, 1, 0], scale: 200, bias: 0.02 };
```

The actors are written once as functions so every panel uses the same model, root and pose, and only the expression changes.

## 5. Choose shots

The layout, 16 px margins and 14 px gutters on a 900 by 1280 page:

```text
+--------------------------------------+
|                roof                  |   wide, 868 x 410
+------------------+-------------------+
|       him        |        her        |   426 x 380 each; her is read first
+-----------+------+-------------------+
|   close   |          over            |   300 x 430 and 554 x 430
+-----------+--------------------------+
```

Cameras:

- `roof`: `{ yaw: 0.05, pitch: 0.14, scale: 150, target: [0, 1.1, -0.4] }`. Nearly frontal, a little from above, wide enough to show the tank on the left and the hut on the right.
- `her`: aimed at her neck bone, yaw her root yaw plus 0.6 (three-quarter), `scale: 640`, `cx: 250` so she sits right of centre and her balloon fits on the left.
- `him`: his root yaw minus 0.2, pitch -0.08 (slightly low), `scale: 600`, `cx: 185`, `cy: 205`.
- `over`: from behind him onto her, `scale: 420`, so his back frames the left of the panel.
- `close`: her head at `scale: 1250`, yaw plus 0.85, no text.

Cameras on the medium and close panels are functions of the bones, so a pose change keeps the framing:

```js
camera: ({ bones }) => ({ yaw: girlRoot.yaw + 0.6, pitch: 0.02, scale: 640, cx: 250, target: up(bones.girl.neck, 0.02) }),
```

Close shots cheat the light towards the camera with `faceLight(yaw, target)`, which keeps the faces clean white with tone shadows instead of half black.

## 6. Build

```sh
node scripts/build.mjs examples/rooftop/page.mjs
```

```text
panel roof         19.21 s
panel her          11.61 s
panel him          13.81 s
panel over         18.18 s
panel close        11.85 s
wrote /path/to/mangaka/examples/rooftop/page.svg (441591 bytes)
```

A second build with nothing changed prints `cached` for every panel.

## 7. Ink direction

Style: `tone-soft`, because the beat is quiet. Decisions per panel:

- Blacks: the hair of both characters, the shadows of the railing and the tank, the far edge of the floor. Faces stay white with tone shadows.
- Sky: a dusk gradient from mid tone at the top to white at the horizon, `gradient(0.52, 0)`.
- Close-up: `shade: { aoRadius: 0.02 }` so the ambient occlusion does not muddy the face.

The first build showed a fault in the `over` panel: the boy's dark vest is a texture with baked wrinkles, and under `tone-soft` its tone sat right at the black threshold (0.86), so the texture flipped between black and tone and left blotches. A region over his back keeps that cloth in screentone:

```js
const backOfBoy = { rect: [36, 112, 196, 318], feather: 8, set: { black: 0.93 } };
// in the over panel: regions: [backOfBoy]
```

## 8. Letter

```js
lettering: [
  caption({ panel: 'roof', text: 'After the last bell, the roof is always empty.', at: [0.66, 0.04], width: 270 }),
  bubble({ panel: 'her', kind: 'speech', text: "I'm moving away. On Sunday.", at: [0.22, 0.18], tail: { actor: 'girl', bone: 'head' } }),
  bubble({ panel: 'him', kind: 'speech', text: '...This Sunday?', at: [0.78, 0.16], tail: { actor: 'boy', bone: 'head' } }),
  bubble({ panel: 'over', kind: 'speech', text: 'Mm. So stay a little. The lights are coming on.', at: [0.74, 0.155], tail: { actor: 'girl', bone: 'head' } }),
],
```

The caption sits in the top right corner of the wide panel, where the reading starts. Each balloon sits on the side its speaker faces, high in the panel, and its tail aims at the speaker's head. Nothing covers a face. The `close` panel has no text.

## 9. Verify like an editor

```sh
node scripts/check.mjs examples/rooftop --page examples/rooftop/page.mjs
```

```text
fingerprint 53c33fa6f5f2 stable over two builds
ok: 5 panels, 4 lettering items, 441591 bytes
```

Then the screenshots:

```sh
node scripts/capture.mjs examples/rooftop --out shots
node scripts/sheet.mjs examples/rooftop --out shots/sheet.png
node scripts/capture.mjs examples/rooftop --part girl.skin --panel close --zoom 4 --out shots
```

Reading `shots/page.png`: the eye enters at the caption, drops to her line, crosses to his, then reads the over-the-shoulder panel before resting on the silent close-up. The largest panel shows the place. Blacks sit in the hair and the shadows on every tier, so no tier reads grey. Reading the sheet: the close-ups land on the hair, the railing and the skyline windows, because those are the densest regions; strokes end cleanly and the vest no longer blotches. The 4x face close-up shows the iris, the highlight and the lash line reading, and also the limit of the method: the lash edge of the far eye is ragged, because it is traced from the model's texture.

That is the editorial pass: one inspection, one batch of fixes (the vest region), one confirmation build. Report the ragged lash edge to the user as a known limit instead of looping on it.

## 10. Rework

A reader opens `examples/rooftop/page.html`, presses **Edit region**, drags over the girl's face in the `her` panel and asks for a softer look. The copied instruction names `panel: her`, a region and `girl.skin`, `girl.hair` and the face parts. That is an expression change: `girl({ sorrow: 0.4, joy: 0.15 })` in that panel only, then:

```sh
node scripts/rework.mjs examples/rooftop/page.mjs --panel her
node scripts/diff.mjs examples/rooftop --panel her --region <region from the instruction> --margin 60
node scripts/capture.mjs examples/rooftop --panel her --out shots/after
```

`references/rework.md` has the rules for each kind of change.
