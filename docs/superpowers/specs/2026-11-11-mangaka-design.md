# mangaka: system design

Status: draft for review, 2026-11-11
Scope: version 1 of the `mangaka` agent skill repository

## 1. What this is

`mangaka` is an agent skill, built the way `wheresryan22/anatomy` is built, that turns a story beat into finished black-and-white manga pages. The agent does not draw pixels. It writes a declarative page: scenes made of 3D forms, cameras, an ink style and lettering. A zero-dependency kit turns that into ink: solid blacks, screentone, hatching, brush outlines, strand hair and lettered panels, as one SVG per page.

The idea that carries the skill: **the page is built, then inked.** A scene is constructed once in 3D and every panel is a camera on it, so a character is the same character in every panel, and any region of a page can be rebuilt without disturbing the rest.

Three throwaway probes back this design (knight page, face page v2, face page v3). They proved the pipeline and showed its gaps. Nothing from the probes is reused as-is.

## 2. Requirements

### Functional

1. **Pages.** Build a manga page from a page spec: panel layout, one camera per panel, scene references, lettering, effects. Output a standalone SVG and an HTML viewer.
2. **Scenes.** Describe a scene as data: forms (primitives and operations), materials, surface drawings, hair, lights.
3. **Ink.** Convert a rendered panel to vector ink: black areas, screentone in two densities, hatching in up to three layers, pressure-varying brush outlines, drawn features, strand hair.
4. **Characters.** Load anime characters from VRM models, pose them by humanoid bone, set expressions by blend shape, and ink them with the same engine as everything else.
5. **Lettering.** Speech, thought, shout and whisper bubbles with tails, caption boxes, sound-effect lettering, left-to-right and right-to-left reading order.
6. **Effects.** Speed lines, focus lines, impact bursts, rain, snow, spatter, tone gradients.
7. **Region rework.** The reader drags a rectangle over a page in the viewer. The viewer resolves it to a panel and the parts beneath it and produces an instruction the user pastes to the agent. The agent changes only that region and proves the rest of the page is unchanged.
8. **Self-check.** Scripts capture the page and close-ups in headless Chrome and run automatic checks. The skill requires the agent to read every image it makes.
9. **Install.** Works as a standard Agent Skill in Claude Code, Codex, OpenCode, Antigravity and MiniMax Code through `npx skills add`, `git clone` or a ZIP.

### Non-functional

| Property | Target for v1 |
|---|---|
| Dependencies | Node 20.10+ built-ins only. Chrome or Chromium for checks. Nothing to `npm install`. |
| Determinism | Same spec in, byte-identical SVG out, on any machine. |
| Locality | Editing one part changes ink only where that part, its shadow or its occlusion reaches. |
| Build time | One page of three panels in under 60 s cold, a region rework in under 15 s, on a 2-core machine. |
| Output size | Under 2 MB per page SVG. |
| Honesty | The README claims only what a committed example shows. |

### Constraints

- English repository, MIT, single author. No `Co-Authored-By` lines in commits.
- Version 1 is black and white. Colour, manhwa scroll format, motion pages and real-time 3D come later (section 11).
- Original characters only. The skill takes technique from references a user shows it, never a named character or a specific page, and says so when asked for one.

## 3. High-level design

```
 story beat
     |
     v
 +-----------+     +-----------+     +------------+     +-----------+     +-----------+
 | page spec | --> |   scene   | --> |   raster   | --> |    ink    | --> |  compose  |
 | page.mjs  |     | forms as  |     | id, depth, |     | blacks,   |     | panels,   |
 | panels,   |     | data,     |     | normal,    |     | tone,     |     | gutters,  |
 | cameras,  |     | materials,|     | tone, aux  |     | hatch,    |     | lettering,|
 | lettering |     | drawings  |     | per panel  |     | brush,    |     | effects   |
 +-----------+     +-----------+     +------------+     | strands   |     +-----------+
                                           |            +-----------+           |
                                           v                                    v
                                     buffer cache                        page.svg, page.html,
                                     (per panel)                         page.map.json
                                                                                |
                         +------------------------------------------------------+
                         v
                  viewer edit mode --> rework instruction --> agent edits spec
                         ^                                         |
                         |                                         v
                  diff check: nothing outside the region moved <-- rebuild one panel
```

Five stages, each a module with one job and a plain-data interface. A stage can be tested without the ones around it.

| Stage | Input | Output | Depends on |
|---|---|---|---|
| `scene` | scene description (data) | compiled parts: distance function, bound, material, name | nothing |
| `raster` | parts, camera, lights | typed-array buffers: part id, depth, normal, tone, aux | `scene` |
| `ink` | buffers, style, decals | ink layers as path strings | `raster` output only |
| `compose` | ink layers per panel, page spec | SVG string, HTML string, map JSON | `ink` output only |
| `vrm` + `mesh` | VRM file, pose, expression, placement | posed triangles rastered into the same buffers | nothing |

## 4. Deep dive

### 4.1 Scene as data

Probes described forms as JavaScript closures. That cannot be addressed, cached, diffed or compiled to a shader. Version 1 describes a form as a tree of plain objects and compiles it.

```js
{ name: 'helm.band', mat: 'iron-dark',
  form: { op: 'sub', args: [
    { op: 'inter', args: [
      { op: 'round', r: 0.006, of: { ref: 'helm.core' } },
      { op: 'box', c: [0, 1.79, 0.012], h: [0.3, 0.027, 0.3] } ] },
    { ref: 'helm.slits' } ] } }
```

- **Primitives:** sphere, ellipsoid, round cone, capped cone, cylinder, box, plane, extruded 2D outline.
- **Operations:** union, smooth union, subtract, smooth subtract, intersect, round, shell, transform, squash, mirror, displace (flutes, lames, folds, noise from a fixed set of named patterns, no free code).
- **Names** are dotted paths (`knight.helm.band`). Every later stage carries the name, so a pixel on the page can be traced back to it.
- `scene.compile(desc)` returns `{ name, mat, sdf, bound, hash }`. `hash` covers the description, so the cache and the rework logic know exactly what changed.
- A builder API (`k.sphere(...)`, `k.smin(...)`) produces the same objects, so scene files stay short and still serialise.

Trade-off: a data tree is more verbose than closures and forbids arbitrary code in displacement. In return it gives addressing, caching, a determinism guarantee and a path to GLSL. Accepted.

### 4.2 Raster

Orthographic camera, one sphere-traced pass per part inside the part's screen bounds, into a z-buffer. Then normals for the winning part, a shadow map from the key light, and a normal-aware screen-space ambient term.

Buffers per panel: `id` (Int16), `depth`, `normal` (3 × Float32), `tone` (0 white to 1 black), `aux` (material-specific, used for hair shine).

- **Tone is per material.** Each material owns a response curve from light to tone (metal: hard contrast with specular whites; skin: flat with a shadow threshold; black hair: black with a shine band).
- **Tiles.** The panel is rastered in 64 px tiles. A rework re-rasters only tiles touched by the changed parts' old and new bounds and shadow footprint.
- **Workers.** Panels render in parallel with `worker_threads`.
- **Cache.** Buffers are stored under `.mangaka/cache/<panel hash>` so a style-only change re-inks without re-rastering.

Trade-off: a mesh rasteriser would be faster, but distance fields give smooth blends, cheap boolean cuts and a short kit. Speed is recovered with bounds, tiles, workers and the cache.

### 4.3 Ink

Layers, bottom to top:

1. **Tone 1 and tone 2.** Regions traced from thresholds on `tone`, filled with dot patterns (`<pattern>`), for materials the style marks as toned.
2. **Blacks.** Regions above the black threshold, traced to smoothed closed paths.
3. **Hatching.** Up to three layers. Straight parallel layers use a scanline pass (even spacing, strokes start and stop on tone thresholds, tapered ends). Form-following layers trace an evenly spaced streamline field along latitude, meridian or silhouette direction of the part.
4. **Brush outlines.** Edges come from part boundaries, depth steps and creases. Chains are smoothed and emitted as filled outlines whose width follows a pressure profile: tapered free ends, heavier in shadow, three weight classes.
5. **Drawings.** Curves and filled shapes authored on a surface in 3D (eyes, brows, mouth, palm lines, engravings, rivets). They are projected per camera and depth-tested, so they follow the form in every panel.
6. **Strands.** Hair and fur lines along each lock, white where they cross black near a shine band, black where they cross a highlight.

**Determinism and locality rule.** No global random sequence. Every random draw comes from a generator seeded with `hash(panel id, part name, layer, cell)`. Hatch seeds live on a screen grid, so a stroke exists or not regardless of what was drawn before it. This is what makes a region rework leave the rest of the page byte-identical. The probes did not have this and it is the first thing tested.

**Styles.** An ink style is a plain object: black threshold, tone thresholds, per-material hatch fields and thresholds, line weights, taper lengths, hatch spacing. Three presets ship: `seinen-dense` (heavy hatching, few tones), `shonen-clean` (open whites, strong blacks, tone for greys), `tone-soft` (mostly screentone). A style can be overridden per panel, per part or per region.

### 4.4 Characters: actors from VRM models

Probes 2 and 3 built heads, hair and hands from code primitives. The result was coarse and was rejected. Probe 4 replaced the source of the shapes: characters are artist-made anime models in the open VRM format, rendered into the same buffers as code-built scenes and inked by the same engine. That probe produced nine distinct characters, poses, a fist and six expressions with no hand work, and was accepted as the way forward.

- **Source.** A character is a `.vrm` file (VRM 0.x in v1, 1.0 later). Users make their own in VRoid Studio or bring any VRM they have the rights to. The repository ships only models whose own metadata says CC0.
- **Loader (`kit/vrm.mjs`).** Pure Node: GLB container, accessors, PNG textures (own decoder on `node:zlib`), node hierarchy, skins, morph targets, VRM humanoid bone map, blend shape groups, material classes read from material names and MToon render settings.
- **Pose.** Rotations per humanoid bone on top of the rest pose, a root transform to place the actor in the scene, and a pose library (stand, walk, run, sit, fight stances, hand shapes). Expressions are blend shape weights: angry, joy, sorrow, fun, surprised, blink, and the five mouth shapes, mixable.
- **Mesh raster (`kit/mesh.mjs`).** A software triangle rasteriser with z-buffer, alpha cut-out from textures, and per-pixel part id, depth, position, normal and texture luminance. It writes into the same buffers as the distance-field raster, so a knight built in code and a character from a model occlude and shadow each other correctly.
- **Ink classes.** Skin: white, shadow as tone, painted detail from the texture. Hair: black with a shine band, or light with strand lines; hair strips keep separate ids so their edges become strand lines. Face layers (eyes, brows, lashes, mouth): the artist's texture is turned straight into black, white and tone. Cloth: texture luminance sets the tone level.
- **Costume and props** come from the model (clothes) and from code (`kit/parts/`: armour, weapons, architecture), attached to bones where needed.

Limits, stated in the README: the look is that of a clean anime character, not a hand-inked seinen face; variety depends on the models a user brings; VRoid models share a family resemblance.

### 4.5 Page spec and compose

```js
export default page({
  size: [900, 1280], reading: 'rtl', style: 'seinen-dense',
  panels: [
    { id: 'p1', rect: [16, 16, 868, 690], scene: 'bust', camera: { yaw: 0.55, pitch: -0.04, scale: 1900, target: [0, -0.05, 0.02] },
      background: { sky: 'storm', moon: [560, 250, 330] }, effects: [{ rain: 0.7 }] },
    { id: 'p2', rect: [16, 722, 426, 542], scene: 'bust', camera: { yaw: -1.32, pitch: -0.2, scale: 1650 } },
  ],
  lettering: [
    { panel: 'p1', caption: 'NINE DAYS OF RAIN.', at: [0.04, 0.04] },
    { panel: 'p2', bubble: 'speech', text: 'SO THE BELLS WERE TRUE.', at: [0.3, 0.15], tail: 'jaw' },
  ],
});
```

- **Layout helpers** produce `rect`s: grids, splash with insets, diagonal cuts, bleed.
- **Bubbles** size themselves to the text with a built-in width table for the bundled fonts, so layout needs no browser. A tail can aim at a named part, resolved through the camera.
- **Fonts** are vendored OFL fonts in `kit/fonts/` with their licences, embedded as subsets.
- **Outputs:** `page.svg` (standalone), `page.html` (viewer with edit mode), `page.map.json`, and `chapter.html` (a reader that pages through a folder).

### 4.6 Region rework

1. `compose` writes `page.map.json`: for each panel its rect, camera and a run-length-encoded part-id map at half resolution with the part-name table.
2. The viewer's edit mode lets the reader drag a rectangle and type what they want. It reads the map, finds the panel, ranks the parts under the rectangle by coverage and copies an instruction:

```
/mangaka rework examples/rain/page-01.mjs
panel: p1   region: [0.42, 0.31, 0.18, 0.22]
parts: bust.hair.fringe-3 (41%), bust.head (33%), bust.hair.fringe-4 (12%)
request: make the fringe fall lower over the eye and add more loose strands
```

3. The skill's rework workflow maps the request to the smallest change that satisfies it:
   - **form:** edit parameters of the listed parts,
   - **ink:** add a region override (hatch density, black threshold, line weight, tone on or off) with a feathered mask,
   - **drawing:** edit or add authored curves on a listed part,
   - **lettering:** move or rewrite a bubble.
4. `scripts/rework.mjs` rebuilds that panel only, using tiles and the cache.
5. `scripts/diff.mjs` compares old and new ink. It fails if any path outside the region plus a margin changed, except where a changed part's silhouette or shadow reaches. It writes a before and after close-up the agent must read.

Text-only requests ("panel 2, the helm, darker") go through the same path with the region resolved from part names.

### 4.7 Verification

| Script | What it does |
|---|---|
| `scripts/capture.mjs` | Headless Chrome screenshots: page, each panel, close-ups at 2× and 4× on a grid or on named parts. |
| `scripts/sheet.mjs` | One contact sheet per page: full page plus close-ups, for the agent to read in one look. |
| `scripts/check.mjs` | Automatic checks, exit 1 on failure (list below). |
| `scripts/rework.mjs`, `scripts/diff.mjs` | Region rebuild and locality proof. |
| `scripts/fingerprint.mjs` | Build twice, compare bytes. |

Checks in `check.mjs`: tone balance per panel inside the style's range (share of black, tone, white); no large empty region on a part the style says should carry ink; no stroke outside its panel; every bubble's text fits and every tail lands on its speaker; bubble order follows the reading direction; drawing visibility (an eye that is fully hidden in a close-up is flagged); SVG size under budget; determinism.

The skill's last workflow step is editorial: put the page next to the examples, read the sheet, and fix what a manga editor would circle. This pass is bounded: one full inspection, one batch of fixes, one confirmation.

### 4.8 Errors

- Scene compile errors name the part path and the field.
- A part whose bound misses its form (clipped silhouette) is detected by sampling and reported.
- A drawing that lands on no surface is reported with its part and curve name instead of vanishing.
- Missing Chrome: builds still work, checks say what to install and how to set `CHROME_PATH`.

## 5. Repository layout

```
mangaka/
├── SKILL.md                 workflow, craft rules in short form, setup
├── kit/
│   ├── scene.mjs            description format, builder, compiler
│   ├── raster.mjs           camera, tiles, z-buffer, normals, shadow, ambient
│   ├── materials.mjs        tone response per material
│   ├── ink.mjs              tone, blacks, hatching, brush, drawings, strands
│   ├── styles.mjs           presets and overrides
│   ├── page.mjs             page spec, layout helpers, compose, map
│   ├── lettering.mjs        bubbles, captions, sound effects, font metrics
│   ├── effects.mjs          lines, weather, spatter, gradients
│   ├── viewer.mjs           HTML viewer and edit mode (inlined into page.html)
│   ├── vrm.mjs              VRM loader: GLB, PNG, skins, morphs, humanoid, expressions
│   ├── mesh.mjs             software triangle raster into the shared buffers
│   ├── poses.mjs            pose and hand-shape library
│   ├── parts/               reusable forms: armour, weapons, architecture, props
│   └── fonts/               vendored OFL fonts and licences
├── references/              craft.md, kit.md, characters.md, ink.md, layout.md,
│                            lettering.md, rework.md, verify.md, walkthrough.md
├── scripts/                 build, capture, sheet, check, rework, diff, fingerprint
├── models/                  CC0 VRM characters with a licence note per file
├── examples/                complete pages with committed output
├── evals/evals.json         test prompts and what a good answer contains
├── tests/                   node:test unit tests and golden fingerprints
├── agents/openai.yaml
├── .github/                 CI, issue forms, README images
└── README.md, CHANGELOG.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, LICENSE
```

## 6. Skill workflow (what SKILL.md tells the agent)

1. **Size it.** Panel, page or chapter. Say what will be built and how long it takes.
2. **Script first.** Beat, page thumbnails in words (panel count, shot sizes, where the eye goes), dialogue. No geometry yet.
3. **Cast and set.** A VRM model per character with a pose and expression plan, and a parts list per code-built object. Density is a rule: a hero object has at least 40 named parts.
4. **Block the scene.** Place forms and lights once. Panels are cameras.
5. **Choose shots.** Vary distance and angle. Close-ups get more ink per centimetre for free.
6. **Build.** `node scripts/build.mjs page.mjs`.
7. **Ink direction.** Pick a style, then direct it: where the blacks sit, what stays white, where tone replaces hatching.
8. **Letter.** Bubbles, captions, sound effects, reading order.
9. **Verify like an editor.** Checks to zero, then the contact sheet.
10. **Rework** when the reader points at a region.

## 7. Trade-offs

| Decision | Alternative | Why this way | Cost |
|---|---|---|---|
| Build in 3D, then ink | Draw 2D paths directly | Consistency across panels, real shadows, any camera, addressable parts | Forms must be modelled; a hand-drawn line has more intent |
| Distance fields | Triangle meshes | Smooth blends, booleans, tiny kit | Slower; recovered with bounds, tiles, workers, cache |
| Vector ink traced from buffers | Raster output | Crisp at any zoom, editable, small with patterns | Tracing code; curve quality tied to buffer resolution |
| Scene as data | Scene as code | Addressing, caching, determinism, GLSL later | Verbose, no free-form displacement |
| Authored drawings on surfaces | Features from shading only | A face needs drawn lines; shading alone reads as a 3D render | Each feature needs curve authoring |
| Node only, no GPU | WebGL build step | Runs anywhere, deterministic | Seconds per panel instead of milliseconds |
| Characters from VRM models | Characters built in code | Artist-made head, hair, hands and face textures; expressions and poses for free; a panel renders in about a second | Look is bound to the models; users need a VRM per character |

## 8. What the probes proved and did not

- **Proved:** hard surfaces built in code (armour, weapons, stone), cloth, weather, panels, lettering, screentone, brush outlines; VRM characters with poses, hands, expressions; both in one scene with shared depth and shadow; effect backgrounds (focus lines, speed lines) through the same tracer.
- **Rejected:** faces, hair and hands built from code primitives.
- **Not proved:** action poses with contact, two characters interacting, long cloth simulation, crowds, interiors.
- **Known ceiling:** the references the author showed are hand-drawn by masters of the form. This engine places every stroke by rule on top of modelled shapes. It reaches clean, consistent, fully lettered pages. It does not match a master's line. The README says so.

## 9. Quality bar for leaving beta

A feature leaves beta when a committed example passes all checks and its contact sheet shows, at 4×: no bare region on an inked material, clean line ends, readable hands, and a face that holds from three cameras with at least three expressions.

## 10. Milestones

Each ends with something that runs.

| | Delivers | Proof |
|---|---|---|
| **M0** | Repo skeleton, `scene`, `raster`, `vrm`, `mesh`, `materials`, `ink`, `styles` with the determinism rule, unit tests | A panel with the knight and a VRM character builds twice byte-identical |
| **M1** | `page`, `lettering`, `effects`, `viewer`, `build`, `capture`, `sheet`, `check` | Example 1: the knight page, checks at zero |
| **M2** | Map, edit mode, `rework`, `diff`, tiles and cache | Rework demo: one region changes, diff proves the rest did not |
| **M3** | Pose and hand-shape library, bone-attached props, `parts` library, hair styles (black, light) | Examples 2 and 3: a dialogue page and an action page |
| **M4** | SKILL.md, references, evals, README with gallery, install matrix, CI | Fresh install runs an eval prompt end to end |
| **M5** | Workers, performance and size budgets met | Timing and size report in CI |

## 11. Later

Colour and cel shading, manhwa scroll layout, motion pages, real-time 3D in WebGL (the scene data compiles to GLSL), a community gallery, PDF export for print.

## 12. Open questions

1. Repository home: delivered as a ZIP, or pushed to `justinjd00/mangaka` once it exists.
2. Whether example pages carry dialogue in English only.
3. Which reading direction is the default for new pages (proposal: `rtl`, as manga is read).
