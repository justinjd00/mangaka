# Kit reference

Every exported function of `kit/`, with its real signature and what it returns. Units are metres in the scene (y up, a standing figure faces +Z), page pixels on the page. Import paths below are relative to the skill folder; from a page file, use a path relative to the page.

Contents: 1. Page, 2. Forms (`sdf.mjs`), 3. Parts library, 4. Attaching to bones, 5. Actors (`vrm.mjs`, `poses.mjs`), 6. Backgrounds and effects, 7. Lettering, 8. Styles and materials, 9. Renderer and inker, 10. Viewer, 11. Randomness, 12. Scripts as modules.

## 1. Page: `kit/page.mjs`

### `definePage(spec)`

Validates a page spec and returns a normalised copy with defaults filled in. Errors name the panel id and the field (`panel "her": camera.scale must be a positive number`). A page file's default export is `definePage({...})`.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `size` | `[w, h]` | required | Page size in px. The examples use `[900, 1280]`. |
| `reading` | `'rtl' \| 'ltr'` | `'rtl'` | Reading direction; `check.mjs` orders bubbles by it. |
| `style` | name or style object | `'seinen-dense'` | Ink style of every panel without its own. |
| `title` | string | `'mangaka page'` | Shown in the viewer's title bar. |
| `panels` | array | required | At least one panel, see below. |
| `lettering` | array | `[]` | Items from `bubble`, `caption`, `sfx`, in reading order. |

A panel:

| Key | Default | Meaning |
|---|---|---|
| `id` | required | Letters, digits, `-`, `_`, starting with a letter; unique. Seeds the panel's ink. |
| `rect` | required | `[x, y, w, h]` in page px. |
| `scene` | `null` | A `scene()` from `sdf.mjs`, or a function `({ actors }) => scene()` called with the posed actors (`actors[name].result.bonePos`, `.boneRot`, and `actors[name].model`, loaded when read). |
| `actors` | `[]` | `{ name, model, pose, expr, root, hands, hair }`, see section 5. `model` is a path relative to the page folder (or a loaded model, which turns the cache off for that panel). |
| `camera` | required when the panel has a scene or actors | `{ yaw, pitch, scale, cx, cy, target }` or a function `({ bones }) => camera`, where `bones[actor][bone]` is a world position. |
| `background` | `flat(0)` (white) | A function `(x, y, W, H) => tone` from `backgrounds.mjs`. |
| `light` | `{}` | Key light, merged over `LIGHT_DEFAULTS` (section 9). |
| `style` | page style | Name or object (`resolveStyle(...)`). |
| `regions` | `[]` | Local ink overrides `{ rect, feather, set }`, see `references/ink.md`. |
| `effects` | `[]` | Items from `effects.mjs`, drawn over the ink. |
| `ss` | `1` | Supersampling, `(0, 4]`. 1.3 to 1.5 for finished panels; higher is slower. |
| `shade` | none | `{ fill, aoRadius, skinDetail, shineAt }` passed to the renderer. `aoRadius: 0.02` for close-ups. |
| `frame` | `4.5` | Border width in px; `0` for none. |
| `inset` | `false` | Drawn after the other panels, with a white gutter around it. |
| `gutter` | `7` for insets, else `0` | White margin around the panel, px. |
| `clip` | `null` | Polygon `[[x, y], ...]` in page px inside `rect`; ink, white ground and border follow it (diagonal panels). |

Camera fields: `yaw` and `pitch` in radians, `scale` in px per metre, `cx`, `cy` the panel pixel where `target` lands (default: panel centre), `target` a world point. The camera is orthographic.

### `buildPage(spec, { dir, cacheDir, onPanel, write, pageFile })`

Builds a page and returns `{ svg, html, map, stats }`.

- `dir`: model paths resolve against it, and `page.svg`, `page.html`, `page.map.json` and `page.stats.json` are written there unless `write: false`.
- `cacheDir`: panel cache folder; an unchanged panel is read back byte-identical. `scripts/build.mjs` uses `<page dir>/.mangaka/cache`.
- `onPanel({ id, ms, cached, uncacheable })`: called after each panel; `uncacheable` says why a panel cannot be cached (a function without a `desc`, a loaded model object).
- `pageFile`: the path named in the viewer's rework instruction.

`stats.panels[i]` holds `{ id, style, balance, black, tone, white, strokes }` (shares of the panel). `map.panels[i]` holds `{ id, rect, clip?, ss, camera, parts, rle }` and `map.lettering[i]` `{ index, type, kind, panel, box }`.

### `decodeMap(rle)`, `treeFingerprint(root)`

`decodeMap` turns a map panel's `rle` into an `Int16Array` of part ids (1-based into `parts`, 0 background) at half resolution. `treeFingerprint` hashes every `.mjs` under a folder; the cache keys on it for `kit/`, so editing the kit invalidates every cached panel.

## 2. Forms: `kit/sdf.mjs`

A form is a distance function carrying a bound (`.b`), a step factor (`.st`) and a plain description (`.desc`). The description is what the cache and the rework logic compare, so every parameter that shapes a form must be in it.

| Function | Signature |
|---|---|
| `sphere` | `sphere(c, r)` |
| `ellipsoid` | `ellipsoid(c, [rx, ry, rz])` |
| `rcone` | `rcone(a, b, r1, r2)`: round cone (capsule with two radii) from point `a` to `b`. |
| `cyl` | `cyl(a, b, r)`: flat-ended cylinder. |
| `ccone` | `ccone(a, b, ra, rb)`: capped cone. |
| `box` | `box(c, [hx, hy, hz], r = 0)`: half extents, edge radius `r`. |
| `union` | `union(...forms)` |
| `smin` | `smin(k, ...forms)`: smooth union with blend radius `k`. |
| `sub` | `sub(a, ...cuts)` |
| `ssub` | `ssub(k, base, cut)`: smooth subtract. |
| `inter` | `inter(a, ...forms)` |
| `round` | `round(f, r)`: grow by `r`, rounding edges. |
| `shell` | `shell(f, t)`: hollow skin of thickness `t`. |
| `xform` | `xform(f, o, R, to = o)`: rotate by `R` about `o`, then move `o` to `to`. |
| `squash` | `squash(f, o, [sx, sy, sz])`: scale about `o`. |
| `mirrorX` | `mirrorX(f)`: mirror across x = 0. |
| `disp` | `disp(f, g, amp, st = 0.6, tag)`: add displacement `g(x, y, z)`; `amp` is its largest size, `tag` a string naming every number `g` reads (required). |
| `raw` | `raw(f, b, st = 0.6, tag)`: any distance function with bound `b = [cx, cy, cz, r]` and a required `tag`. |
| `rotX`, `rotY`, `rotZ` | `rotX(a)`: row-major 3x3 rotation. |
| `mmul`, `mapply` | `mmul(A, B)`, `mapply(R, v)`. |
| `noise3`, `fbm` | `noise3(x, y, z)` in [0, 1); `fbm(x, y, z, octaves = 3)`. |
| `surf` | `surf(f, origin, dir, maxT = 3)`: first surface point along a ray, or `null`. |
| `hashForm`, `part` | `hashForm(form)`: 8-hex id of a description; `part(name, mat, form, opts)`. |
| `scene` | `scene()`: see below. |

`scene()` returns `{ parts, decals }` with these methods:

| Method | Adds |
|---|---|
| `add(name, mat, form, opts = {})` | A named part; returns `form`. `opts.fields` overrides the material's hatch fields, `opts.axis` sets the axis of `lat`/`mer` hatching. |
| `rivet(form, from, dir, r = 0.006)` | A rivet where the ray from `from` along `dir` hits `form`. |
| `hole(form, from, dir, r = 0.0042)` | A black hole, placed the same way. |
| `line(points, { w = 1, ko = false })` | A drawn line through world points; `w` is 0, 1 or 2 (thin, medium, heavy), `ko` adds a white knockout under it. |
| `lineOn(form, origins, dir, opts)` | A line projected onto `form` from each origin along `dir`. |
| `poly(points, { closed = true, fill, stroke, sw = 1 })` | A drawn shape, depth tested (lit windows, emblems). |
| `strand(points, { thr = 0.5 })` | A hair strand line, white over black hair near its shine. |

Part names are dotted paths (`roof.tank.leg.2`). The viewer groups names that differ only by a trailing number, so number repeated parts.

```js
import * as S from '../../kit/sdf.mjs';

const sc = S.scene();
const drum = sc.add('tank.drum', 'metal', S.cyl([0, 0.8, 0], [0, 1.8, 0], 0.6));
sc.add('tank.lid', 'metalD', S.ccone([0, 1.8, 0], [0, 2.0, 0], 0.63, 0.06));
sc.add('tank.hoop.0', 'metalD', S.cyl([0, 1.1, 0], [0, 1.14, 0], 0.612));
sc.rivet(drum, [0, 1.3, 2], [0, 0, -1], 0.012);
```

## 3. Parts library: `kit/parts/`

Every builder has the shape `builder(sc, prefix, params) => anchors`: it adds parts named `<prefix>.<sub>` (and decals) to `sc` and returns anchor points in world space. Defaults of the armour pieces fit a 1.8 m figure standing at the origin facing +Z (the knight in `examples/gate/knight.mjs`). `side` is +1 for the figure's left (+X), -1 for its right.

### `armor.mjs`

| Builder | Params (defaults) | Returns |
|---|---|---|
| `greatHelm` | `{ at = [0, 1.652, 0.012], plume = true }` | `{ base, top, visor }` |
| `breastplate` | `{ at = [0, 1.42, 0.035] }` | `{ chest, neck }` |
| `pauldron` | `{ side = 1, shoulder = [side * 0.238, 1.53, 0] }` | `{ shoulder, top }` |
| `fauld` | `{ at = [0, 1.085, 0.005], hips = 0.108 }` | `{ belt, hipL, hipR }` |
| `gauntlet` | `{ side = -1, shoulder, elbow, wrist, grip = null, detail = true }`; `grip: { at, axis }` closes the hand round a haft | `{ hand, wrist, elbow }` |
| `greave` | `{ side = -1, hip, knee, ankle }` | `{ knee, ankle }` |
| `sabaton` | `{ ankle = [0, 0.1, 0], toe = [0, 0, 1] }` | `{ ankle, toe }` |
| `heaterShield` | `{ at = [0.45, 1.03, 0.25], yaw = 0.5, emblem = true }` | `{ center, boss }` |
| `cape` | `{ at = [0, 1.57, -0.1], length = 1.4, sweep = 0.2 }` | `{ neck, hem }` |

### `weapons.mjs`

Sword, poleaxe and spear are built in their own frame (grip or butt at the origin, +Y towards the head) and placed with `{ at, R }`.

| Builder | Params (defaults) | Returns |
|---|---|---|
| `sword` | `{ at, R, blade = 0.75, width = 0.022, thick = 0.0045, guard = 0.09, grip = 0.18, gripR = 0.0135 }`; `grip: 0` leaves out grip and pommel | `{ grip, guard, tip, pommel }` |
| `poleaxe` | `{ at, R, length = 2.28 }` | `{ base, top, head, grip }` |
| `spear` | `{ at, R, length = 2.1, head = 0.26 }` | `{ base, top, tip }` |
| `arrow` | `{ tip = [0, 0, 0], nock = [0, 0.72, 0], r = 0.0075, head = true }` | `{ tip, nock }` |

### `architecture.mjs`

| Builder | Params (defaults) | Returns |
|---|---|---|
| `ground` | `{ at = [0, 0, 0.15], size = [3.2, 0.62, 2.4], rough = 0.035, slab = false }`: a mound, or with `slab` a flat paved slab whose top is at `at[1]` | `{ top }` |
| `wall` | `{ from, to, height = 1, thick = 0.2, cap = true, courses = 0, mat = 'stone' }` | `{ from, to, top }` |
| `railing` | `{ from, to, height = 1.05, spacing = 1.2, rails = 1, bars = 0, r = 0.022, mat = 'metalD' }` | `{ from, to, top }` |
| `stairs` | `{ at, yaw = 0, steps = 5, rise = 0.17, run = 0.28, width = 1.2, mat = 'stone' }` | `{ foot, top }` |
| `column` | `{ base, h = 2.4, r = 0.19, tilt = 0, broken = false }` | `{ base, top }` |
| `rubble` | `{ at, count = 22, inner = 0.38, outer = 1.68, spread = [1.3, 0.8], size = [0.025, 0.09], drop = 0.02, seed = [prefix] }` | `{ center }` |

### `props.mjs`

| Builder | Params (defaults) | Returns |
|---|---|---|
| `crate` | `{ at = [0, 0, 0], size = 0.5, yaw = 0 }` | `{ top }` |
| `lantern` | `{ at, height = 0.32, yaw = 0 }` | `{ light, top }` |
| `bench` | `{ at, yaw = 0, length = 1.6, height = 0.45, depth = 0.42, back = true }`; the sitter faces +Z of the bench | `{ seat, back }` |

### `util.mjs`

`lerp3(a, b, t)`, `add`, `sub`, `scale(a, k)`, `nrm`, `cross`, `dot`, `at3(p, x, y, z)`, `ANY` (a bound that never culls, for half-space cuts inside `inter`), `tag(...values)` (builds a closure tag), `alignY(d)` (rotation taking +Y to direction `d`), `dFlutes(f, a, b, k, A, amp, st)` (k flutes round the axis a-b), `dSaw(f, o, dir, pitch, A, amp, st)` (stacked lames).

```js
import * as S from '../../kit/sdf.mjs';
import { ground, wall, railing } from '../../kit/parts/architecture.mjs';
import { crate, bench } from '../../kit/parts/props.mjs';

const sc = S.scene();
ground(sc, 'yard.floor', { slab: true, at: [0, 0, 0], size: [3, 0.1, 2] });
wall(sc, 'yard.wall', { from: [-3, 0, -1.5], to: [3, 0, -1.5], height: 1.8, courses: 0.3 });
railing(sc, 'yard.rail', { from: [-3, 1.8, -1.5], to: [3, 1.8, -1.5], height: 0.8, bars: 0.15 });
crate(sc, 'yard.crate.0', { at: [1.4, 0, -0.9], size: 0.5, yaw: 0.3 });
const { seat } = bench(sc, 'yard.bench', { at: [-1, 0, -0.8], yaw: 0.2 });
```

## 4. Attaching to bones: `kit/attach.mjs`

A frame is `{ origin, R }`: `R` is row-major 3x3, its columns are the local axes in world space.

| Function | Signature |
|---|---|
| `boneFrame` | `boneFrame(model, result, bone)`: the bone's world frame from a `poseVRM` result (`bonePos`, `boneRot`). Pass `model = null` inside a scene function, so a cached build never loads the model. |
| `attachTo` | `attachTo(sc, frame, build)`: runs `build(localScene)` in the frame's local space and adds its parts and decals to `sc` in world space; returns `build`'s anchors mapped to world space. |
| `placed` | `placed(sc, { at, R }, build)`: the same with a frame from `at` and `R`; with neither, `build(sc)` runs directly. |
| `frameOffset` | `frameOffset(frame, offset, R)`: a frame moved by `offset` in its own axes and turned by `R`. |
| `toWorld` | `toWorld(frame, v)` |

The sword in a right hand closed with `HANDS.hilt` (from `examples/duel/page.mjs`):

```js
import * as S from '../../kit/sdf.mjs';
import { boneFrame, attachTo } from '../../kit/attach.mjs';
import { sword } from '../../kit/parts/weapons.mjs';

const GRIP = { at: [0.065, -0.032, 0], R: S.rotX(-Math.PI / 2), blade: 0.5, grip: 0.13, gripR: 0.0115, guard: 0.07, width: 0.02 };
const withSword = ({ actors }) => {
  const sc = S.scene();
  attachTo(sc, boneFrame(null, actors.boy.result, 'rightHand'), local => sword(local, 'boy.sword', GRIP));
  return sc;
};
// panel: { scene: withSword, actors: [{ name: 'boy', ..., hands: { right: 'hilt' } }], ... }
```

## 5. Actors: `kit/vrm.mjs`, `kit/poses.mjs`

### `loadVRM(path)`

Loads a VRM 0.x file and returns `{ j, vrm, materials, prims, skins, parent, bones, groups, texture, morphTarget, meta }`. `bones` maps humanoid bone names to nodes, `groups` the blend shape groups (lower case), `meta` the file's licence block. Throws `VRM 1.0 is not supported yet; export as VRM 0.x` for VRM 1.0 and `not a VRM file` for anything else.

### `poseVRM(model, { pose = {}, expr = {}, root = null, flip = true, skin = true })`

Returns `{ posed, bonePos, boneRot }`. `pose` maps bone names to Euler `[x, y, z]` radians (or quaternions) applied on top of the rest pose; `expr` maps blend shape names to weights (0 to 1); `root` is `{ pos: [x, y, z], yaw }`. `skin: false` poses the bones only (fast). You do not call this for a page; `buildPage` does it from the actor.

### `partNamer(actorName)`

Names an actor's parts: `<actor>.skin`, `<actor>.hair.<n>` per hair strip, and `<actor>.<material>` for the rest, such as `boy.Tops`, `boy.Bottoms`, `boy.Shoes`, `boy.FaceBrow`, `boy.FaceEyeline`, `boy.FaceEyelash`, `boy.EyeIris`, `boy.EyeWhite`, `boy.EyeHighlight`, `boy.FaceMouth` on the VRoid models.

### Actor fields in a panel

| Field | Meaning |
|---|---|
| `name` | Prefix of its part names and key in `bones`. |
| `model` | Path to the `.vrm`, relative to the page folder. |
| `pose` | A `POSES` name or a pose object. |
| `hands` | `{ left, right }`: `HANDS` names or hand shapes, applied over the pose. |
| `expr` | Blend shape weights: `joy`, `angry`, `sorrow`, `fun`, `surprised`, `blink`, `blink_l`, `blink_r`, mouth shapes `a`, `i`, `u`, `e`, `o`. |
| `root` | `{ pos, yaw }`: where it stands and which way it faces. Yaw 0 faces +Z. |
| `hair` | `'black'` (default: black with a shine band) or `'light'` (open white with strand lines). |

### `poses.mjs`

- `POSES`: `tpose`, `stand`, `relaxed`, `guard`, `reach`, `walk`, `run`, `sit` (lower the root by about 0.45 m and put a seat under it).
- `HANDS`: `open`, `relaxed`, `fist`, `point`, `grip`, `hilt`, written for a left hand and mirrored for the right.
- `withHands(pose, { left, right })`: replaces the finger bones.
- `mirrorPose(pose)`: left to right.
- `mixPose(a, b, t)`: blends two Euler poses.

Sign rules (from `poses.mjs`): positive Z lowers the left arm from the T-pose, negative Z lowers the right; swinging an upper arm forward is -Y on the left and +Y on the right.

```js
import { POSES, withHands, mixPose, mirrorPose } from '../../kit/poses.mjs';

const ready = mixPose(POSES.stand, POSES.guard, 0.6);
const pointing = withHands({ ...POSES.reach, head: [0, -0.2, 0] }, { right: 'point' });
const otherSide = mirrorPose(pointing);
```

## 6. Backgrounds and effects

`kit/backgrounds.mjs`: each returns `(x, y, W, H) => tone` (0 white, 1 black) in panel pixels, carrying a `desc` so the panel stays cacheable. A hand-written background needs its own `desc` too (see `split` in `examples/gate/page.mjs`).

| Function | Signature |
|---|---|
| `flat` | `flat(v = 0)` |
| `gradient` | `gradient(top, bottom)` |
| `split` | `split(xFrac, left, right)` |
| `storm` | `storm({ moon = null, seed = 'storm' })`: night clouds; `moon: [x, y, r]` in panel px. |
| `focusLines` | `focusLines({ cx, cy, r0, count = 150, density = 0.5, seed = 'focus' })` |
| `speedLines` | `speedLines({ angle = 0, density = 0.5, pitch = 7, seed = 'speed' })` |
| `scaled` | `scaled(fn, ss)`: used by `buildPage`; you do not need it. |

`kit/effects.mjs`: drawn over the ink, seeded by the panel id unless you pass `seed`.

| Function | Signature |
|---|---|
| `rain` | `rain({ density = 1, angle = 0.3, seed })` |
| `snow` | `snow({ density = 1, seed })` |
| `spatter` | `spatter({ at = [0.5, 0.5], count = 40, radius = 60, seed })`: `at` as fractions of the panel. |

## 7. Lettering: `kit/lettering.mjs`

| Function | Signature |
|---|---|
| `bubble` | `bubble({ kind = 'speech', text, at, tail = null, width = null, panel = null })`: kinds `speech`, `thought`, `shout`, `whisper`; `at` is the centre; `tail` a point or `{ actor, bone }`. |
| `caption` | `caption({ text, at, width = null, panel = null })`: `at` is the top-left corner; `width` in page px. |
| `sfx` | `sfx({ text, at, rotate = 0, size = 44, panel = null })`: `at` is the baseline start, `rotate` in degrees. |
| `measure` | `measure(text, font, size)`: width in px; `font` is `'dialogue'` or `'sfx'`. |
| `wrap` | `wrap(text, font, size, maxWidth)`: lines. |
| `layoutLettering` | `layoutLettering(item, frame)`: SVG and geometry of one item. |
| `checkLettering`, `fontMetrics`, `fontCss`, `fontsOf`, `FONTS` | Used by the page builder. |

`at` and point tails are fractions of the panel rect (of the page with no `panel`). Dialogue is set upper case in Comic Neue Bold; sound effects in Bangers. Details in `references/lettering.md`.

## 8. Styles and materials

`kit/styles.mjs`:

- `STYLES`: `seinen-dense`, `shonen-clean`, `tone-soft`.
- `resolveStyle(nameOrObject = 'seinen-dense', overrides = {})`: a fresh style; `materials` merge per material and key, every other key is replaced.

Style keys: `black`, `tone1`, `tone2` (thresholds on tone 0..1), `toneMats` (materials that get screentone, which skips their hatch layers 0 and 1), `materials` (per material `{ fields, thresholds, len, crease }`), `brush` (three line weights), `hatchSpacing`, `depthK` (edge sensitivity, 0.3 for close-ups), `balance` (`{ black: [min, max] }` checked by `check.mjs`).

```js
import { resolveStyle } from '../../kit/styles.mjs';

const close = resolveStyle('seinen-dense', { depthK: 0.3, toneMats: ['sky', 'skin', 'tex', 'fabric'], balance: { black: [0.04, 0.6] } });
```

`kit/materials.mjs`: `MATERIALS` (tone functions) and `toneOf(mat, ctx)`. Form materials: `metal`, `metalD` (dark metal), `cloth`, `hair` (dark mass), `leather`, `wood`, `mail` (chain mail arcs), `stone`, `ground`. Actor materials, set by the loader from the VRM material names: `skin`, `hairB`, `fabric`, `tex` (face textures). `references/ink.md` describes each.

## 9. Renderer and inker

You normally reach these through `buildPage`.

- `kit/shade.mjs`: `renderPanel({ scene, actors, cam, background, light, fill, aoRadius, skinDetail, shineAt })` returns buffers and the part list. `LIGHT_DEFAULTS = { dir: [-0.62, 0.62, 0.55], target: [0, 1.1, 0], scale: 240, bias: 0.022, size: 1100 }`: `dir` points towards the light, the shadow map is centred on `target` and covers `size / scale` metres. `ACTOR_MATS` maps actor material classes to materials.
- `kit/raster.mjs`: `makeCam`, `lightCam`, `project(cam, p)` (returns `[x, y, depth]`, larger depth nearer), `rasterSDF`, `normalsSDF`, `shadowTerm`, `ambient`.
- `kit/mesh.mjs`: `rasterMesh(model, posed, cam, idOf, wantColor)`.
- `kit/ink.mjs`: `inkPanel(r, { style, seed, regions, ss })` and `encoder(ss)`.
- `kit/png.mjs`: `decodePNG`, `encodeGray`, `encodeRGBA`.

## 10. Viewer

- `kit/viewer.mjs`: `viewerHtml({ svg, map, pageFile, title })` writes `page.html`. Deep link: `page.html#select=x,y,w,h&request=...` (page px) opens edit mode with that selection.
- `kit/viewer-core.mjs`: `partsInRect(map, rect)` returns `{ panel, region, parts }` for a page rect; `formatInstruction({ pageFile, panel, region, parts, request })` the instruction text; `decodeRle`, `partGroup`.

```js
import { readFileSync } from 'node:fs';
import { partsInRect, formatInstruction } from '../../kit/viewer-core.mjs';

const map = JSON.parse(readFileSync('examples/gate/page.map.json', 'utf8'));
const hit = partsInRect(map, [180, 950, 220, 150]);
console.log(formatInstruction({ pageFile: 'examples/gate/page.mjs', ...hit, request: 'make the eyes darker' }));
```

## 11. Randomness: `kit/rng.mjs`

`hash32(...keys)`, `rng(seed)`, `rngFor(...keys)` (a seeded stream), `rand01(...keys)` (one stateless number). Never use `Math.random` or `Date` in a page or a part: the same page must build to the same bytes. Seed streams with stable keys (`rngFor('rooftop', 'skyline', i)`), one stream per object, so adding one object does not reshuffle the others.

## 12. Scripts as modules

`scripts/check.mjs` exports `checkPage({ stats, map, svgBytes })` and `readingBefore(a, b, reading)`; `scripts/fingerprint.mjs` exports `fingerprint(pageFile)`; `scripts/capture.mjs` exports `plan`, `partBox`, `clampCrop`, `cropHtml`; `scripts/diff.mjs` exports `diffPages`, `splitSvg`, `pathPoints`; `scripts/chrome.mjs` exports `findChrome()` and `screenshot({ url, out, width, height, scale })`.
