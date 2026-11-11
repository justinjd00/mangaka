---
name: mangaka
description: >-
  Build lettered black-and-white manga pages as SVG. Scenes are modelled in code (distance-field forms and a parts library: armour, weapons, architecture, props) and characters come from VRM models, including the user's own VRoid characters; every panel is a camera on that scene, inked by rule into screentone, solid blacks, hatching and brush outlines, then lettered with speech bubbles, captions and sound effects. Each page ships with a viewer where the reader drags a rectangle over any region and gets a rework instruction for that spot. Use this whenever someone asks for a manga page, a comic page, a manga panel, a storyboard, a character scene, a webcomic page in black and white, or an ink illustration of a character, even if they never say "manga".
license: MIT
compatibility: Written for Claude Code; also runs in Codex, OpenCode, Antigravity and MiniMax Code. Needs Node.js 20.10+, and Chrome or Chromium for the screenshot checks.
metadata:
  opencode/slash: "true"
---

# mangaka

This skill makes finished manga pages: panels, gutters, screentone, solid blacks, hatching, brush outlines, speech bubbles and sound effects, as one standalone `page.svg` plus a viewer `page.html`. You do not draw pixels. You write a page file (`page.mjs`) that declares the scene, the actors, one camera per panel, an ink style and the lettering. The kit renders each panel, traces it into vector ink and assembles the page.

Three complete examples ship with the skill. Open the closest one before you start; they are the quality bar.

- `examples/rooftop/` is a quiet dialogue page: two classmates at a school roof railing at dusk, five panels (establishing shot, two singles, an over-the-shoulder shot, a silent close-up), `tone-soft` style. The roof is built from the parts library in `roof.mjs`. Start here for conversation scenes.
- `examples/gate/` is a mood page: a knight in plate armour at a ruined gate in the rain, a boy facing him, close-ups of the boy's face, his fist and the helm in an inset. The knight (`knight.mjs`) is the reference for a dense code-built object. `seinen-dense` style, storm sky, rain, focus and speed lines.
- `examples/duel/` is an action page: the boy charges with a sword held in his hand bone, strikes the shield and shouts. Two diagonal panels with clip polygons, a sword attached to a bone, `shonen-clean` style.

Each one builds with `node scripts/build.mjs examples/<name>/page.mjs` and passes `node scripts/check.mjs examples/<name>`.

## The one idea

**The page is built, then inked.** Every page is a small 3D set: forms from code, characters from VRM models, a key light. Each panel is a camera on that set. Because the character is the same model in every panel, she has the same face, hair and clothes from every angle, her shadow falls where it should, and a prop in her hand stays in her hand. Because every pixel of every panel knows which named part it came from, a reader can point at any region and you can change exactly that and prove nothing else moved.

So do not fight the build with ink. A face that reads wrong is a camera, pose, expression or light problem first. Ink settings come last.

## Workflow

Work in this order. Most of the quality is decided before the first build.

1. **Size it.** Say what you will make before any other work:
   - **Panel**: one panel, one or two actors, maybe a few props. Build it without asking.
   - **Page**: four to seven panels with lettering. Say so and build it. Have a first build within the first half hour and improve from there.
   - **Chapter**: several pages. Do not start it. Propose the first page, list the pages that would follow, and wait for the user to choose.
   A cold build takes about 10 to 20 seconds per panel on one core (the five-panel rooftop page takes about 75 seconds); cached panels take no time. Tell the user that once, not after every build.
2. **Script first.** Write the beat in one sentence, then the page in words: panel count, the shot size of each panel (wide, medium, close, extreme close), where the eye enters and leaves, and every line of dialogue and every sound effect. No geometry yet. Show this to the user for a page; for a single panel, state it and continue.
3. **Cast and set.** One VRM model per character with a pose and expression plan per panel, and a parts list for every code-built object. Density is a rule: a hero object (the thing a panel is about, like the knight) has at least 40 named parts; a set (a roof, a street, a room) has a floor, a far boundary and at least three objects that say where we are.
4. **Block the scene.** Place the set, the actors (`root: { pos, yaw }`) and the key light once, in metres, y up. Write the set as a function in its own file (like `roof.mjs`) so panels can share it. Panels that show the same moment are cameras on this one scene; never move an actor between them to fix a framing. A new moment may move an actor (the duel's charge, then the hit).
5. **Choose shots.** Vary distance and angle across the page: at least one wide shot that shows the place, at least one close-up, no two neighbouring panels with the same shot size and angle. Close-ups get more ink per centimetre for free, so put the emotional beat in one. Aim cameras at bones (`camera: ({ bones }) => ...`) so a pose change keeps the framing.
6. **Build.** `node <skill>/scripts/build.mjs <page dir>/page.mjs`. It prints a time per panel and writes `page.svg`, `page.html`, `page.map.json` and `page.stats.json` next to the page file.
7. **Ink direction.** Pick a style, then direct it: decide where the solid blacks sit (hair, a coat, the night sky, the shadow side of a face in a dramatic beat), what stays white (faces in calm beats, a lit sky, the subject against a busy ground), and where screentone replaces hatching. Use `regions` for local changes, a style override for the panel, or another preset.
8. **Letter.** Bubbles, captions and sound effects, in reading order (`rtl` by default, so the first bubble is the top right one). Tails point at the speaker's head bone.
9. **Verify like an editor.** Run `check.mjs` to zero, capture the page and the contact sheet, and read every PNG. Then put the page next to the examples and fix what an editor would circle (see below). One full inspection, one batch of fixes, one confirmation build.
10. **Rework** when the reader points at a region in the viewer. See "Rework" below.

## Setup

`<skill>` below is the folder that holds this `SKILL.md`. Put the user's pages in their project, one folder per page (for example `manga/ch01-p01/page.mjs`), never inside `<skill>`. A page file imports the kit with a path relative to itself (for example `../../.claude/skills/mangaka/kit/page.mjs`), and model paths in a page are resolved against the page's folder. Build outputs and the panel cache (`.mangaka/cache/`) are written next to the page; screenshots go to `shots/` in the current directory unless you pass `--out`.

| Module | Use it for |
|---|---|
| `kit/page.mjs` | `definePage(spec)` validates a page; `buildPage(spec, opts)` renders, inks, letters and writes it. |
| `kit/sdf.mjs` | Forms: `sphere`, `ellipsoid`, `rcone`, `cyl`, `ccone`, `box`, `union`, `smin`, `sub`, `ssub`, `inter`, `round`, `shell`, `xform`, `squash`, `mirrorX`, `disp`, `raw`, rotations, and `scene()` to collect named parts and decals. |
| `kit/parts/armor.mjs` | `greatHelm`, `breastplate`, `pauldron`, `fauld`, `gauntlet`, `greave`, `sabaton`, `heaterShield`, `cape`. |
| `kit/parts/weapons.mjs` | `sword`, `poleaxe`, `spear`, `arrow`. |
| `kit/parts/architecture.mjs` | `ground`, `wall`, `railing`, `stairs`, `column`, `rubble`. |
| `kit/parts/props.mjs` | `crate`, `lantern`, `bench`. |
| `kit/parts/util.mjs` | Vector helpers, `alignY`, closure `tag`, displacement patterns `dFlutes` and `dSaw`. |
| `kit/attach.mjs` | `boneFrame`, `attachTo`, `placed`, `frameOffset`, `toWorld`: props that follow a hand or any frame. |
| `kit/vrm.mjs` | `loadVRM(path)` (VRM 0.x), `poseVRM(model, { pose, expr, root })`, `partNamer`. |
| `kit/poses.mjs` | `POSES` (tpose, stand, relaxed, guard, reach, walk, run, sit), `HANDS` (open, relaxed, fist, point, grip, hilt), `withHands`, `mirrorPose`, `mixPose`. |
| `kit/backgrounds.mjs` | Panel grounds: `flat`, `gradient`, `split`, `storm`, `focusLines`, `speedLines`. |
| `kit/effects.mjs` | Over the ink: `rain`, `snow`, `spatter`. |
| `kit/lettering.mjs` | `bubble` (speech, thought, shout, whisper), `caption`, `sfx`, plus `measure` and `wrap`. |
| `kit/styles.mjs` | `STYLES` (`seinen-dense`, `shonen-clean`, `tone-soft`) and `resolveStyle(name, overrides)`. |
| `kit/materials.mjs` | Tone per material: `metal`, `metalD`, `cloth`, `hair`, `leather`, `wood`, `mail`, `stone`, `ground` for forms; `skin`, `hairB`, `fabric`, `tex` for actors. |
| `kit/shade.mjs`, `kit/raster.mjs`, `kit/mesh.mjs`, `kit/ink.mjs` | The renderer and the inker. You rarely call them directly. |
| `kit/viewer.mjs`, `kit/viewer-core.mjs` | The viewer written to `page.html` and the region-to-instruction logic. |
| `kit/rng.mjs` | `hash32`, `rngFor`, `rand01`: the only source of randomness. |

| Script | What it does |
|---|---|
| `scripts/build.mjs <page.mjs> [--no-cache]` | Build a page. Unchanged panels come from the cache. |
| `scripts/check.mjs <dir> [--page <page.mjs>]` | Tone balance per panel, size budget, lettering inside its panel, bubble order; with `--page`, also builds twice and compares bytes. Exit 1 on any problem. |
| `scripts/capture.mjs <dir> [--panel id] [--part name] [--zoom 2\|4] [--grid n] [--out shots/]` | Chrome screenshots: the page, a panel, a part's box, or an n by n grid of close-ups. |
| `scripts/sheet.mjs <dir> [--out shots/sheet.png]` | One contact sheet: the page plus six 3x close-ups of the densest regions. |
| `scripts/rework.mjs <page.mjs> [--panel id]` | Save `page.prev.svg`, rebuild with the cache, fail if a panel other than `--panel` was rebuilt. |
| `scripts/diff.mjs <dir> --panel id --region x,y,w,h [--margin 40] [--allow-part name ...]` | Prove every changed stroke lies inside the region (plus margin) or near an allowed part. |
| `scripts/fingerprint.mjs <page.mjs>` | Build twice in fresh processes and compare SHA-256 of the SVG. |

A one-panel page file looks like this, with paths as seen from `examples/<name>/` (from a user's project, point them at `<skill>/kit/` and `<skill>/models/`). `references/walkthrough.md` follows a full page step by step.

```js
import { definePage } from '../../kit/page.mjs';
import { POSES } from '../../kit/poses.mjs';
import { gradient } from '../../kit/backgrounds.mjs';
import { bubble } from '../../kit/lettering.mjs';

const mio = (expr = {}) => ({ name: 'mio', model: '../../models/shino.vrm', pose: POSES.relaxed, root: { pos: [0, 0, 0], yaw: 0 }, expr });
const head = bones => [bones.mio.head[0], bones.mio.head[1] + 0.04, bones.mio.head[2]];

export default definePage({
  size: [900, 632], reading: 'rtl', style: 'tone-soft', title: 'First panel',
  panels: [
    { id: 'face', rect: [16, 16, 868, 600], ss: 1.4, actors: [mio({ joy: 0.6 })],
      camera: ({ bones }) => ({ yaw: 0.5, pitch: 0, scale: 1100, cx: 300, target: head(bones) }),
      background: gradient(0.35, 0), shade: { aoRadius: 0.02 } },
  ],
  lettering: [
    bubble({ panel: 'face', text: 'Morning! You are early.', at: [0.78, 0.2], tail: { actor: 'mio', bone: 'head' } }),
  ],
});
```

## Craft rules (short form)

`references/craft.md` has the reasoning and more examples.

- **Composition.** Put the subject on a third, not dead centre, and leave the bubble room on the side the character faces or speaks towards. Every panel answers one question (where, who, what they feel, what happens); if a panel answers none, cut it.
- **Shot variety.** Wide, medium and close across the page; vary the camera yaw by at least 0.3 radians between neighbouring panels; one panel per page is clearly the largest, and it carries the beat. Low angles (negative pitch) for threat or resolve, high angles for loneliness.
- **Where blacks go.** Blacks lead the eye. Use them to frame the subject (night sky behind a lit face, dark hair against a pale ground) and keep them off the middle of a face in a calm beat. A panel with no black reads grey; a panel that is mostly black loses its subject. `check.mjs` holds each panel inside the style's black range.
- **Tone or hatching.** Screentone for skin, cloth, sky and calm surfaces; hatching for metal, stone, wood and anything rough or under strain. Do not stack both on one surface. `tone-soft` is mostly tone, `shonen-clean` keeps whites open and hatches only hard surfaces, `seinen-dense` hatches nearly everything.
- **Bubble placement and reading order.** Bubbles follow the reading direction: for `rtl`, top right first, then right to left and down. List lettering in that order; `check.mjs` fails when the list and the positions disagree. Keep bubbles near the top of a panel and inside it.
- **Never a bubble over a face or a hand.** Faces and hands carry the acting. Move the bubble or the camera's `cx`, never cover them. Captions go in a corner.
- **Tails toward the chin.** Aim tails with `{ actor, bone: 'head' }`; the kit stops the tail short of the face. A tail never crosses another character.
- **Keep props seated in hands.** A held prop is attached to the hand bone (`attachTo` with `boneFrame`), the hand is closed with a matching `HANDS` shape, and you check the grip in a 4x close-up. A floating or sunk prop is the most visible fault on a page.
- **Check every PNG.** Every screenshot you take, you open and look at. A build that passes `check.mjs` can still have a cut-off head, a blank panel corner or a bubble on a mouth.

## Characters: bring your own VRM

Characters are VRM 0.x files. Two CC0 models ship in `models/` (`fumiriya.vrm`, a boy, and `shino.vrm`, a girl, both from VRoid samples). A user who wants their own character:

1. Makes it in **VRoid Studio** (free) and exports it with VRoid's VRM export, choosing **VRM 0.0** when the version offers 0.0 and 1.0. VRM 1.0 files are rejected with "VRM 1.0 is not supported yet; export as VRM 0.x".
2. Puts the `.vrm` file anywhere and gives you its path; set `model` to that path relative to the page folder.
3. You check the licence before you use it: `loadVRM(path).meta` holds `licenseName`, `allowedUserName`, `commercialUssageName` and `otherLicenseUrl`. Tell the user what it says. Use a model only if the user made it or its licence allows the use. Never copy a third-party model into this repository; `models/` holds CC0 files only.

Then run one test panel per new character: a front close-up with `expr: {}` and one with `joy`, to see how its face textures ink. `references/characters.md` covers posing, expressions, hands, hair and part names.

## Original characters only

Make original characters and original pages. When the user shows a reference (a page, a panel, an artist), take only technique from it: panel rhythm, shot choice, where the blacks sit, how dense the hatching is, the shape of a bubble. Never reproduce a named character from someone else's work, a recognisable costume or design, or a specific existing page. When asked for one, say plainly that you will not copy it, and offer an original character or page that uses the same technique.

## Rework

The viewer (`page.html`) has an **Edit region** button. The reader drags a rectangle, types what should change, and copies a block like this into the chat:

```text
/mangaka rework examples/gate/page.mjs
panel: resolve   region: [0.19, 0.15, 0.25, 0.41]
parts: boy.hair (48%), boy.skin (44%), boy.EyeIris (3%), boy.FaceEyeline (2%), boy.EyeWhite (1%), boy.FaceBrow (1%)
request: make the eyes darker
```

`region` is `[x, y, w, h]` as fractions of the panel rect; `parts` are the parts under the rectangle by share (numbered siblings such as `boy.hair.43` are grouped). When you get one:

1. Open the page file and find the panel. Convert the region to panel pixels: multiply x and w by the panel width, y and h by its height.
2. Choose the smallest change that does what the request asks:
   - **ink** (darker, lighter, more or less hatching, heavier lines, tone on or off): add `{ rect, feather, set }` to that panel's `regions`, with `set` holding `black`, `tone1`, `tone2`, `hatch` or `brush`.
   - **acting** (expression, gaze, a hand): change that panel's actor `expr`, `pose` or `hands` only. If the actor object is shared with other panels, give this panel its own copy.
   - **form** (a part's size or shape): edit the part's parameters. If the scene is shared, build a variant for this panel so the others stay cached.
   - **lettering**: move `at`, change `text`, `kind` or `tail` of that item.
   - **framing**: change that panel's camera.
3. Run `node <skill>/scripts/rework.mjs <page.mjs> --panel <id>`. It must say every other panel was cached.
4. Run `node <skill>/scripts/diff.mjs <page dir> --panel <id> --region <x,y,w,h> --margin 60`. It must end `ok`. When a pose or form change moves a part's outline or shadow beyond the region, rerun with `--allow-part <name>` for that part and say so to the user.
5. Capture the panel (`capture.mjs <dir> --panel <id>` and a `--zoom 4 --part` close-up if the change is small), read the PNG, and report what changed.

A request that names no region ("panel 2, the helm, darker") follows the same path: find the part in `page.map.json` and use `capture.mjs --part` to see its box (`--part` and `--allow-part` also take a group name as the viewer lists it, such as `boy.hair` for `boy.hair.43`, `boy.hair.19` and so on). `references/rework.md` has worked examples of each kind.

## Verify like an editor

```sh
node <skill>/scripts/check.mjs <page dir> --page <page dir>/page.mjs
node <skill>/scripts/capture.mjs <page dir> --out shots
node <skill>/scripts/sheet.mjs <page dir> --out shots/sheet.png
node <skill>/scripts/capture.mjs <page dir> --part <actor>.skin --zoom 4 --out shots
```

Read `shots/page.png` and `shots/sheet.png`. Then look for what an editor circles: a cut-off head or hand at a panel edge, a panel whose subject is unclear at a glance, two neighbouring panels with the same shot, a bubble on a face or a hand, a tail crossing a character, a prop that floats or sinks, an eye hidden by hair in a close-up, a blotchy cloth texture flipping between black and tone, a bare grey panel with no black. Fix in one batch, rebuild, check once more. `references/verify.md` explains every check, every message and how to read a contact sheet.

## Limits

Say these plainly when they matter to the request:

- The look is clean anime characters inked by rule. It does not match a master's hand-drawn line, and faces read as their VRM models do.
- Black and white only. Colour, manhwa scroll format, motion pages and real-time 3D are not in this version.
- Characters come from VRM models, so variety depends on the models the user brings. The two bundled models share the VRoid family look.
- Not yet proved: two characters in physical contact, crowds, interiors, long cloth.
- The camera is orthographic: no perspective foreshortening. Distant things must be built smaller (see the skyline in `roof.mjs`).
- Builds take seconds per panel, not milliseconds; checks need Chrome.

## References

- `references/walkthrough.md`: one page from beat to checked page, using `examples/rooftop/`. Read it first.
- `references/kit.md`: every exported function with its signature.
- `references/characters.md`: VRM models, posing, expressions, hands, props in hands, VRoid export.
- `references/layout.md`: page sizes, panel rects, insets, diagonal panels, shot choice, cameras.
- `references/ink.md`: styles, materials, tone versus hatching, regions, light.
- `references/lettering.md`: bubbles, captions, sound effects, reading order.
- `references/rework.md`: the region workflow with worked examples.
- `references/verify.md`: checks, screenshots, contact sheets and what to fix.
- `references/craft.md`: the craft rules in full.
