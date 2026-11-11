# Ink

How a rendered panel becomes ink, how to pick and direct a style, and how to change ink in one spot without touching the rest.

## What the inker draws

Every pixel of a panel has a part id, a depth, a normal and a tone from 0 (white) to 1 (black), computed by the part's material from the key light, a fill light, shadows and ambient occlusion. The inker then draws, bottom to top:

1. **Screentone** in two densities (`tone1`, `tone2` thresholds) on materials the style lists in `toneMats`.
2. **Solid blacks** wherever tone reaches the style's `black` threshold.
3. **Hatching** in up to three layers per material. Straight layers (`diag`, `diag2`) are scanlines; form-following layers (`lat`, `mer`, `sil`, `cross`, `fix`, `fix2`, `flow`) follow the surface. Strokes start and stop on tone thresholds and taper at the ends.
4. **Chain mail** arcs on `mail`, grit dots on `ground` and `stone`.
5. **Brush outlines** from part boundaries, depth steps and creases, in three weights (crease, inner edge, silhouette), heavier in shadow, tapered at free ends.
6. **Decals**: drawn lines, shapes, rivets, holes and hair strands from the scene.
7. **Effects** (rain, snow, spatter) over everything, clipped to the panel.

Every random choice is seeded by the panel id, the part name, the layer and a screen cell, so ink in one place never depends on ink elsewhere. That is what lets a region rework leave the rest of the page byte-identical.

## Styles

| Style | Look | Tone on | Hatching on | Black range |
|---|---|---|---|---|
| `seinen-dense` | Heavy hatching, few tones, dramatic. `examples/gate/` | skin, fabric, face textures | metal, cloth, hair, leather, wood, stone, ground, sky | 12% to 60% |
| `shonen-clean` | Open whites, strong blacks, tone for greys. `examples/duel/` | sky, cloth, skin, fabric, face textures | metal, dark metal, stone, ground | 5% to 50% |
| `tone-soft` | Mostly screentone, quiet. `examples/rooftop/` | every material | a core layer only | 3% to 45% |

Pick by the beat, not by habit: `tone-soft` for conversation and memory, `shonen-clean` for action and comedy, `seinen-dense` for dread, weight and old things. One style per page, with per-panel overrides for close-ups.

### Overrides

`resolveStyle(name, overrides)` returns a new style; `materials` merge per material, everything else is replaced. A panel takes it as `style`:

```js
import { resolveStyle } from '../../kit/styles.mjs';

// Close-ups: fewer depth edges, tone on the face, a wider black range.
const close = resolveStyle('seinen-dense', { depthK: 0.3, toneMats: ['sky', 'skin', 'tex', 'fabric'], balance: { black: [0.04, 0.6] } });

// Hatch cloth with straight lines only, and start hatching earlier.
const flatCloth = resolveStyle('seinen-dense', { materials: { cloth: { fields: ['diag', 'diag2', null], thresholds: [[0.1, 0.4], [0.45, 0.7], [1, 1]] } } });
```

Keys:

| Key | Meaning |
|---|---|
| `black` | Tone at which a pixel turns solid black. Lower means more black. |
| `tone1`, `tone2` | Where light and dark screentone start on `toneMats`. |
| `toneMats` | Materials that get screentone; their hatch layers 0 and 1 are skipped. |
| `materials[m].fields` | Three hatch layers: `'diag'`, `'diag2'` (straight), `'lat'`, `'mer'` (around and along a part's axis), `'sil'` (along the silhouette), `'cross'`, `'fix'`, `'fix2'`, `'flow'`, or `null`. |
| `materials[m].thresholds` | `[lo, hi]` per layer: the tone range in which strokes of that layer start. `[1, 1]` turns a layer off. |
| `materials[m].len` | `[min, max]` stroke length in px. |
| `materials[m].crease` | How sharp a fold must be to get a crease line (lower draws more). |
| `brush` | Three line weights in px. |
| `hatchSpacing` | Spacing of the three layers in px. |
| `depthK` | Depth-step edge sensitivity; 0.3 for close-ups, so a cheek does not get an outline. |
| `balance` | `{ black: [min, max] }`, the range `check.mjs` enforces per panel. |

A part can override its material's fields with `sc.add(name, mat, form, { fields: [...] })`, and set the axis of `lat` and `mer` hatching with `{ axis: [x, y, z] }`.

## Materials

| Material | Reads as | Notes |
|---|---|---|
| `metal` | Polished plate: hard contrast, white specular highlights. | The knight's armour. |
| `metalD` | Dark iron: the same at 72%. | Rails, hinges, legs of things. |
| `cloth` | Matte fabric with a soft rim. | Capes, banners, paper. |
| `hair` | A dark mass, never lighter than mid grey. | Plumes; also distant buildings (the rooftop skyline uses it for dark blocks). |
| `leather`, `wood` | Mid tones with a rim. | Grips, wraps, planks, hafts. |
| `mail` | Rows of small arcs. | Chain mail. |
| `stone` | Full tonal range with grit dots. | Walls, columns, roofs. |
| `ground` | Earth with grit dots. | Floors and mounds. |
| `skin` | White with a tone shadow and painted detail from the texture. | Actors only. |
| `hairB` | Black with a shine band, or light with strands (`hair: 'light'`). | Actors only. |
| `fabric` | Texture brightness sets the tone. | Actors only. |
| `tex` | Face textures straight to black, white and tone. | Actors only. |

## Directing the ink

Decide before you build, panel by panel, and write it in the script:

- **Where the blacks sit.** Night sky, hair, a dark coat, the shadow side of a face in a dramatic beat, the gap behind a door. Blacks frame the subject; the eye goes to the white next to the largest black.
- **What stays white.** Faces in calm beats, a sunlit sky, the subject against a busy ground, the space where a bubble goes.
- **Where tone replaces hatching.** Skin and soft cloth almost always; the sky in quiet scenes; everything in a memory or a dream.

Then use the tools in this order:

1. **Light.** Most ink problems are light problems. `light: { dir, target, scale, bias }`: `dir` points towards the light. A low side light (`dir` with a small y) gives long shadows and a half-black face; a light from the camera side flattens a face into clean white. The shadow map is centred on `target` and covers `1100 / scale` metres; for a close-up, centre it on the head and raise `scale` to 700 with `bias: 0.006`, as the examples do with `faceLight` and `closeLight`.
2. **Background.** `flat(0.95)` behind a pale subject makes a strong black frame; `gradient(0.52, 0)` gives a dusk sky; `focusLines` and `speedLines` add energy and are pure black and white.
3. **Style override** for the panel.
4. **Regions** for one spot.

### Regions

A region changes ink inside one rectangle of one panel, blending out over a feather:

```js
regions: [{ rect: [36, 112, 196, 318], feather: 8, set: { black: 0.93 } }]
```

`rect` is `[x, y, w, h]` in panel pixels (from the panel's top-left corner, before supersampling). `set` may hold:

| Key | Effect |
|---|---|
| `black` | Black threshold here. Lower (0.6 to 0.75) darkens: more of the area turns solid. Higher (0.9 to 0.95) keeps dark cloth in tone. |
| `tone1`, `tone2` | Screentone thresholds here. Raise both above 1 to turn tone off. |
| `hatch` | Multiplier on tone for hatching: 1.3 hatches more and earlier, 0.6 less. |
| `brush` | Multiplier on outline width: 1.4 heavier, 0.7 lighter. |

`examples/rooftop/page.mjs` uses one on the `over` panel: the boy's dark vest texture sat right at `tone-soft`'s black threshold, so texture noise flipped between black and tone and left blotches; a region with `black: 0.93` over his back keeps that cloth in screentone. A region is also the usual answer to an ink rework ("make the eyes darker" became `{ rect: [160, 55, 220, 150], feather: 10, set: { black: 0.7 } }` on the gate's `resolve` panel).

## Supersampling

`ss` renders the panel at `ss` times its size and scales the ink back down: finer hatching, smoother outlines, slower builds. The examples use 1.3 for wide panels and 1.4 to 1.5 for close-ups. Use 1 while blocking a page, then raise it.
