# Lettering

Speech, thought, shout and whisper bubbles, caption boxes and sound effects. Text is measured with the real metrics of the bundled fonts, so a bubble always fits its text and layout needs no browser.

## Items

```js
import { bubble, caption, sfx } from '../../kit/lettering.mjs';

lettering: [
  caption({ panel: 'roof', text: 'After the last bell, the roof is always empty.', at: [0.66, 0.04], width: 270 }),
  bubble({ panel: 'her', kind: 'speech', text: "I'm moving away. On Sunday.", at: [0.22, 0.18], tail: { actor: 'girl', bone: 'head' } }),
  sfx({ panel: 'clash', text: 'Klang!!', at: [0.6, 0.155], rotate: -10, size: 58 }),
]
```

All positions are fractions of the panel rect (`[0, 0]` top left, `[1, 1]` bottom right). With no `panel`, they are fractions of the page.

| Item | `at` is | Other fields |
|---|---|---|
| `caption` | the box's top-left corner | `width` in page px fixes the box width (text wraps to it); without it the box fits the text up to 280 px. |
| `bubble` | the centre of the balloon | `kind`, `tail`, `width` (target text width in px; without it the balloon is a little wider than tall). |
| `sfx` | the start of the baseline | `rotate` in degrees, `size` in px (default 44). |

Dialogue and captions are set upper case in Comic Neue Bold at 15.5 px (shout 17, whisper 14), with typographic apostrophes. Sound effects are Bangers, white with a black outline. `\n` in text forces a line break.

## Bubble kinds

| Kind | Shape | Use |
|---|---|---|
| `speech` | Ellipse, wedge tail. | Normal talk. |
| `thought` | Cloud, a trail of three shrinking circles. | Inner voice. |
| `shout` | Spiky burst, wedge tail. | Yelling, shock. |
| `whisper` | Dashed ellipse, dashed tail. | Quiet or secret lines. |

Captions are rectangles for narration, time and place. Use them in corners, never in the middle of a panel.

## Tails

- `tail: { actor: 'girl', bone: 'head' }` aims at the bone and stops short of it (at most 60 px from the balloon), so the tail points at the face without covering it. This is the default to use.
- `tail: [x, y]` puts the tip exactly at that point (fractions of the panel), for a speaker off panel or a precise spot (the tail of the gate's `...it moved?!` ends at a fixed point below his face).
- No tail for a voice from off panel in a caption-like bubble, or for a narrator.

Aim at `head` for speech. The tail leaves the balloon on the side facing the target. Place the balloon so the tail is short and does not cross another character or another balloon.

## Placement

- **Reading order.** In `rtl`, the first line is the top right balloon, then right to left, then down. List lettering in that order. `check.mjs` compares each panel's list with the positions and fails with `bubble lettering[3] reads before lettering[2] (rtl) but is listed after it`.
- **Near the top.** Balloons sit in the upper part of a panel, so the eye reads the line before it reaches the face.
- **Never over a face or a hand.** Move the balloon, or move the camera's `cx` and `cy` to make room. A balloon may overlap hair, sky, background or a shoulder.
- **Inside the panel.** `check.mjs` fails a caption or balloon that leaves its panel by more than 12 px. A sound effect may cross the border; it only has to stay on the page.
- **Short lines.** At most about 25 words per balloon and three balloons per panel. Split a long speech across two balloons of the same speaker, joined by placement, or across two panels.
- **Speaker side.** In a two-shot, the balloon of the person on the right goes on the right. If that crosses tails, the shot is wrong, not the lettering.

## Sound effects

Sound effects are part of the drawing: big, rotated, near the source, often crossing an edge of the action. Rotate 5 to 15 degrees against the motion for impact, along it for speed. Size 40 to 60 px. One per panel at most. Keep them off faces like balloons.

From the examples: `Shaaaaa` (rain, rotated 73 degrees, running down the gate's column), `Grip!` (a fist closing), `Dash!` (a run, low in the panel), `Klang!!` (steel on a shield, above the hit), `Grrk...` (armour creaking).

## Measuring

`measure(text, font, size)` gives the width in px of one line (`font` is `'dialogue'` or `'sfx'`), and `wrap(text, font, size, maxWidth)` the lines. Use them to plan room for a long line:

```js
import { measure, wrap } from '../../kit/lettering.mjs';

console.log(measure('I SAID I’M NOT RUNNING!', 'dialogue', 17));
console.log(wrap('MM. SO STAY A LITTLE. THE LIGHTS ARE COMING ON.', 'dialogue', 15.5, 150));
```

The fonts (Comic Neue and Bangers, SIL Open Font License 1.1) are embedded in each page as base64 WOFF2, only the ones the page uses.
