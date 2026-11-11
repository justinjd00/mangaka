# Layout and shots

How to cut a page into panels and choose a camera for each.

## The page

The examples use a 900 by 1280 px page (close to the B5 proportion of a printed manga page) with a 16 px outer margin and 14 px gutters between panels. Keep those unless the user asks for another size. `reading: 'rtl'` is the default: a manga page reads from the top right panel, right to left, then down. Use `'ltr'` for a Western webcomic.

Panel rects are `[x, y, w, h]` in page px. There is no layout helper; write the rects by hand from a sketch in words. A three-tier page with margins 16 and gutters 14:

```js
// Tier heights 410, 380, 430: 16 + 410 + 14 + 380 + 14 + 430 + 16 = 1280.
const W = 868;                                  // 900 - 2 * 16
const top = [16, 16, W, 410];                   // full width
const midR = [458, 440, 426, 380];              // right half, read first in rtl
const midL = [16, 440, 426, 380];               // left half
const lowR = [330, 834, 554, 430];              // wider right panel
const lowL = [16, 834, 300, 430];               // narrow left panel
```

That is the rooftop page. List panels in reading order in `panels` too; it makes the file easier to follow and the map matches the reading.

### Insets

An inset sits on top of another panel with a white gutter around it: `{ inset: true, gutter: 7, frame: 3.2 }`. The gate's helm inset sits in the lower right of the `resolve` panel. The viewer and the checks treat an inset as its own panel. Keep the inset off the larger panel's subject.

### Diagonal panels

`clip` is a polygon in page px inside the panel's `rect`; ink, white ground and border follow it. The duel page opens with two panels split by a slanted gutter:

```js
{ id: 'charge', rect: [392, 16, 492, 450], clip: [[512, 16], [884, 16], [884, 466], [392, 466]], ... },
{ id: 'knight', rect: [16, 16, 484, 450], clip: [[16, 16], [500, 16], [380, 466], [16, 466]], ... },
```

The two slanted edges run parallel, 12 px apart horizontally, like a normal gutter. Use diagonals for action; a quiet page with diagonal panels feels nervous.

### Borderless and bleed

`frame: 0` drops a panel's border. A panel that reaches the page edge (`rect` from 0) bleeds. Use both sparingly: once per page at most, for the beat.

## Planning a page

Write the page in words before any rect:

```text
Beat: she tells him she is moving away; he does not know what to say.
1. roof (wide, high): the empty roof at dusk, the two of them small at the railing. Caption.
2. her (medium close, 3/4): she says it. sorrow 0.55.
3. him (medium close, 3/4, a little low): he repeats it. surprised.
4. close (extreme close, no text): her face, a small smile. fun 0.7.
5. over (over his shoulder onto her): she asks him to stay. Last line.
```

Rules of thumb:

- **Four to seven panels** on a page. Fewer for a big beat, more for fast action or comedy.
- **One panel is clearly the largest**, and it carries the beat or the place.
- **Open with where**, unless the page continues a scene: the first panel of a scene shows the place and who is in it.
- **Alternate shot sizes.** Never two neighbouring panels with the same shot size and angle.
- **A silent panel** (no text) after a line gives the reader time to feel it.
- **The last panel** on a page (bottom left in `rtl`) is a hook or a turn.

## Shots and cameras

The camera is orthographic: `scale` is pixels per metre, and there is no perspective, so size on the page depends only on `scale`.

| Shot | What it shows | `scale` in a 400 px tall panel |
|---|---|---|
| Wide (establishing) | The place, figures small | 120 to 340 |
| Full | Head to feet | 200 to 260 |
| Medium | Waist up | 400 to 650 |
| Close | Head and shoulders | 1000 to 1500 |
| Extreme close | Eyes, a hand, a mouth | 1800 to 2200 |

`yaw` turns the camera around the target. The camera at yaw `y` sees a character whose `root.yaw` is `y` straight from the front; add 0.3 to 0.8 for a three-quarter view (the faces in the rooftop page use the character's yaw plus 0.6 and minus 0.2). `pitch` raises the camera: positive looks down from above (smallness, loneliness, an overview), negative looks up from below (threat, resolve). Keep pitch within about -0.25 to 0.25.

`target` is the world point at the panel pixel `[cx, cy]` (default the panel centre). Aim at bones so the framing follows the pose:

```js
camera: ({ bones }) => ({ yaw: girlRoot.yaw + 0.6, pitch: 0.02, scale: 640, cx: 250, target: [bones.girl.neck[0], bones.girl.neck[1] + 0.02, bones.girl.neck[2]] })
```

Use `cx` and `cy` to place the subject on a third and leave room for the bubble on the other side. In the `her` panel the target sits at x 250 of 426, so her bubble fits on the left.

Shot habits:

- **Over the shoulder.** Camera behind one character, aimed at the other's face; the near character's back and head frame one side (the rooftop `over` panel).
- **Reaction.** After a line, cut to the listener, closer than the speaker was.
- **Insert.** An extreme close-up of a hand, an object, an eye: the grip panel in the gate page.
- **Axis.** Keep both characters on the same sides of the frame across a conversation; if she is on the right in panel 2, she stays on the right.

## Backgrounds behind a shot

A close-up does not need the set. Leave `scene` out (actors only) and give it a background: `focusLines` for shock, `speedLines` for motion, `flat(0.95)` or a `gradient` for mood. A medium shot with the set needs a background for the sky (`gradient`, `storm`).
