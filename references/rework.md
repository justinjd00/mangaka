# Region rework

The reader points at a region of a finished page; you change exactly that and prove the rest of the page did not move.

## Where the instruction comes from

Every build writes `page.html`, a viewer. Its **Edit region** button turns on edit mode: the reader drags a rectangle over the page, sees the panel and the parts under it, types what should change, and presses **Copy**. The copied block:

```text
/mangaka rework examples/gate/page.mjs
panel: resolve   region: [0.19, 0.15, 0.25, 0.41]
parts: boy.hair (48%), boy.skin (44%), boy.EyeIris (3%), boy.FaceEyeline (2%), boy.EyeWhite (1%), boy.FaceBrow (1%)
request: make the eyes darker
```

- Line 1: the page file, relative to where the build ran.
- `panel`: the panel id. When the rectangle's centre is inside an inset, the inset.
- `region`: `[x, y, w, h]` as fractions of the panel rect, clipped to the panel.
- `parts`: up to eight part groups under the rectangle by share of its area. Numbered siblings (`boy.hair.43`) are grouped (`boy.hair`). The background is not listed.
- `request`: the reader's words.

A deep link opens the same state: `page.html#select=180,950,220,150&request=make%20the%20eyes%20darker` (page pixels).

## The steps

1. **Locate.** Open the page file and find the panel. Panel pixels of the region: `x * w`, `y * h`, `w_frac * w`, `h_frac * h` with the panel's `rect` width and height. For the example, `resolve` is 868 by 370, so the region is about `[165, 56, 217, 152]`.
2. **Look.** Capture the panel before you change anything: `node <skill>/scripts/capture.mjs <dir> --panel resolve --out shots/before`. Read it.
3. **Classify the request and make the smallest change** (below).
4. **Rebuild that panel only.** `node <skill>/scripts/rework.mjs <page.mjs> --panel resolve`. It saves `page.prev.svg`, rebuilds with the cache and prints `rebuilt` or `cached` per panel (`built (no cache yet)` for a panel the cache has never held, which does not count against the edit). It exits 1 if another panel was rebuilt; then your change reached a shared object (an actor function, a scene, the page style), so give the panel its own copy.
5. **Prove locality.** `node <skill>/scripts/diff.mjs <dir> --panel resolve --region 0.19,0.15,0.25,0.41 --margin 60`. Use the region from the instruction. It prints per panel and layer whether strokes changed inside or outside, and ends `ok: every change lies inside [...]` or `FAIL: changes outside [...]`.
6. **Look again.** `capture.mjs <dir> --panel resolve --out shots/after`, plus a `--zoom 4 --part <name>` close-up for small changes. Read both PNGs. Report what you changed, the diff result, and anything the reader should know.

## Kinds of change

| Request sounds like | Change | Example |
|---|---|---|
| darker, lighter, more black, less black, more hatching, softer, heavier lines, no tone here | **ink**: a region on that panel | `regions: [{ rect: [160, 55, 220, 150], feather: 10, set: { black: 0.7 } }]` |
| she should smile, look angrier, close her eyes | **expression**: that panel's actor `expr` | `girl({ joy: 0.5 })` instead of `girl({ sorrow: 0.55 })` |
| look at him, raise the hand, make a fist | **pose or hands**: that panel's actor | `hands: { left: 'fist' }`, `pose: { ...pose, head: [...] }` |
| bigger helm, longer sword, remove the plume | **form**: the part's parameters | `greatHelm(sc, 'knight.helm', { plume: false })` |
| move the bubble, change the line, make it a shout | **lettering**: that item | `at: [0.7, 0.12]`, `kind: 'shout'` |
| closer, from below, show more of the sky | **framing**: that panel's camera | `scale: 1300`, `pitch: -0.12` |

Pick the first kind that can satisfy the request. "Make the eyes darker" could be an expression change, but darker ink in that spot is smaller and stays inside the region.

### Ink

Region `rect` is in panel pixels; take the instruction's region, grow it by a few pixels, and feather 6 to 12. Values: `black` 0.65 to 0.75 to darken, 0.9 to 0.95 to keep dark cloth in tone; `hatch` 1.3 to hatch more, 0.6 less; `brush` 1.4 heavier lines, 0.7 lighter; `tone1` and `tone2` above 1 to remove screentone. A worked case, tested on the gate page:

```js
{ id: 'resolve', /* ... */
  background: split, style: close, shade: tight,
  regions: [{ rect: [160, 55, 220, 150], feather: 10, set: { black: 0.7 } }] },
```

`rework.mjs --panel resolve` rebuilt only `resolve`; `diff.mjs --margin 40` reported one brush stroke just outside the grown region, and `--margin 60` passed. Use a margin of at least 60 for ink changes: a brush outline that crosses the region edge counts as changed along its whole changed part.

### Expression, pose and hands

If the actor comes from a shared function (`girl(...)`), pass the new values for this panel only. An expression changes only the face, so the diff stays inside a face region. A pose or hand change moves the outline and the shadow of that limb, which may reach beyond the region: run `diff.mjs` with `--allow-part <name>` for each moved part (for example `--allow-part boy.skin`), which allows changes within three margins of that part's box. Say that you allowed it.

### Form

A scene shared between panels (the rooftop's `roof` is used by two panels, the gate's `knight` by two) changes every panel that shows it. If the request is about one panel, give the builder an option and build a variant for that panel only (for example a `buildKnight({ plume })` that passes `plume` on to `greatHelm`) unless the reader wants the change everywhere; ask when unsure. Allow the changed part in the diff.

### Lettering

Lettering is not part of the panel cache: `rework.mjs --panel` shows every panel cached, and `diff.mjs` compares lettering items separately and fails a changed item whose box lies outside the region. When the reader asks to move a bubble out of the region, that failure is expected; say so.

### Framing

A camera change redraws the whole panel, so the diff fails by design. Say so before you do it, and after the rebuild show the panel to the reader instead of a diff.

## Requests without a region

"Panel 2, the helm, darker." Find the panel id and the part name in `page.map.json` (`parts` lists every part of the panel). `node <skill>/scripts/capture.mjs <dir> --panel helm --part knight.helm.shell --zoom 4 --out shots` shows it and prints nothing about the box; to get the box as a region, compute it with `partBox` from `scripts/capture.mjs`:

```js
import { readFileSync } from 'node:fs';
import { partBox } from '../../scripts/capture.mjs';

const map = JSON.parse(readFileSync('examples/gate/page.map.json', 'utf8'));
const panel = map.panels.find(p => p.id === 'helm');
const [x, y, w, h] = partBox(panel, 'knight.helm.shell');          // page px
const [px, py, pw, ph] = panel.rect;
console.log([(x - px) / pw, (y - py) / ph, w / pw, h / ph].map(v => v.toFixed(2)).join(','));
```

Then follow the same steps with that region.

## When it goes wrong

- **`rebuilt more than panel "x"`**: the edit touched something shared. Revert, copy the shared object for this panel, try again.
- **`panel x is not cacheable`** warnings: a background or other function without a `desc`, or a loaded model object instead of a path. Such a panel is rebuilt every time, so the locality claim does not cover it. Give the function a `desc` (see `split` in `examples/gate/page.mjs`).
- **diff fails on a few strokes at the edge**: raise `--margin` to 60 or 80. Larger than that means the change really reached further; look at what moved.
- **The change is not visible**: the region may be over a material whose ink the setting does not touch (screentone thresholds on a hatched material, `hatch` on a `toneMats` material). Look at `references/ink.md` and choose the other key.
