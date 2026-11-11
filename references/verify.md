# Verify

How to check a page: the automatic checks, the screenshots, the contact sheet, and the editorial pass that comes after. Read every PNG you make; a page that passes every script can still have a bubble on a mouth.

## Order

```sh
node <skill>/scripts/build.mjs <dir>/page.mjs
node <skill>/scripts/check.mjs <dir> --page <dir>/page.mjs
node <skill>/scripts/capture.mjs <dir> --out shots
node <skill>/scripts/sheet.mjs <dir> --out shots/sheet.png
node <skill>/scripts/capture.mjs <dir> --grid 3 --zoom 2 --out shots/grid
```

Then close-ups of whatever the page is about: faces, hands, props in hands.

## `check.mjs`

`node scripts/check.mjs <dir> [--page <page.mjs>]` reads `page.stats.json`, `page.map.json` and `page.svg` in `<dir>`. Exit 0 prints a line like `ok: 5 panels, 4 lettering items, 441591 bytes`; exit 1 lists the problems. What it checks and how to fix each:

| Message | Meaning | Fix |
|---|---|---|
| `panel x: black share 3.1% is outside seinen-dense's range 12.0% to 60.0%` | Too little or too much solid black for the style. | Too little: a darker background, a lower light, a darker material, or a region with lower `black`. Too much: a lighter background, light from the camera side, or a style override. Change `balance` only for a close-up whose black range really differs (the gate's `close` style does). |
| `panel x: 98.2% white, the panel is nearly empty` | Nothing landed in the panel. | The camera misses the subject: check `target`, `scale`, `cx`, `cy`. |
| `panel x: 98.0% black, the panel is nearly solid` | The panel is all black. | Usually a camera inside a form or a background of 1. |
| `page.svg is ... bytes, over the 2 MB limit` | Too much ink. | Lower `ss` on the densest panels, or a style with fewer hatch layers. |
| `lettering[i] (bubble in x) leaves its panel` | The item crosses its panel's border by more than 12 px. | Move `at` inwards or narrow `width`. |
| `lettering[i] (...) leaves the page` | Off the page (sound effects too). | Move it. |
| `panel x: bubble lettering[j] reads before lettering[i] (rtl) but is listed after it` | The list order and the reading order disagree. | Swap the items or their positions. |
| `rebuild fingerprint differs` | Two clean builds gave different bytes (only with `--page`). | Something is not deterministic: `Math.random`, `Date`, or anything read from the machine. Use `kit/rng.mjs` with stable keys. |

What it does not check: whether a tail lands on the right speaker, whether a face is hidden, whether a prop sits in a hand, whether a panel is readable. That is your job with the screenshots.

`--page` builds the page twice in fresh processes, so it takes as long as two cold builds. Run it once per page, not after every change. `node scripts/fingerprint.mjs <page.mjs>` runs the same comparison on its own.

## `capture.mjs`

`node scripts/capture.mjs <dir> [--panel id] [--part name] [--zoom 2|4] [--grid n] [--out shots/]` takes Chrome screenshots of `page.svg`:

| Options | Writes |
|---|---|
| none | `page.png`, the whole page at 1x |
| `--panel id` | `panel-<id>.png`, the panel with a small margin |
| `--part name` | `part-<panel>-<name>.png` for every panel that shows the part (or only `--panel`), 2x by default |
| `--grid n` | n by n close-ups of the page or of `--panel`, `grid-<r>-<c>.png`, 2x by default |
| `--zoom 2` or `4` | the scale |

`--part` takes a full part name from the map (`boy.skin`, `knight.helm.shell`, `boy.hair.12`), not a group name. List names with the snippet in `references/characters.md`.

## `sheet.mjs`

`node scripts/sheet.mjs <dir> [--out shots/sheet.png]` writes one image: the whole page on the left and six 3x close-ups of the densest-inked regions (at most two per panel) on the right, each labelled with its panel id. It prints which cells it picked, such as `helm[1,1] gate[0,1] shock[0,0]`.

How to read it:

1. **The page at a glance.** Without reading the text, can you tell where the scene is, who is in it and which panel is the beat? Does the eye enter top right (for `rtl`) and leave bottom left? Is there one clear largest panel? Are the blacks spread so no tier is grey and none is a black slab?
2. **The close-ups.** These are the densest regions, where ink faults show: hatching that clumps or leaves bare patches on a surface that should be inked, outlines that break into dashes, screentone blotches flipping between tone and black on a textured cloth, strokes crossing a silhouette. Speed and focus lines are dense by design; skip them.
3. **What the sheet does not pick.** It picks dense regions, so faces in `tone-soft` pages and hands may not appear. Capture them with `--part`.

## The editorial pass

Put your page next to the closest example (`.github/assets/*.png` or a fresh capture of `examples/<name>`) and look for what an editor circles:

- A head, hand or foot cut by a panel edge at a joint (wrist, neck, knee). Cut between joints or leave room.
- A panel whose subject is unclear at 1x.
- Two neighbouring panels with the same shot size and angle.
- A balloon on a face or a hand; a tail crossing a character or pointing at the wrong one.
- A held prop floating off the palm or sunk through the fingers (4x close-up of the hand).
- An eye hidden by hair or a hand in a close-up meant to show the face.
- A bare region on an inked material, or blotches on dark cloth.
- A sky with no tone in a page that has toned skies elsewhere.
- A caption in the middle of a panel.
- A sound effect over a face.

Fix everything you found in one batch, rebuild, rerun `check.mjs`, capture once more and confirm. That is one inspection, one batch of fixes and one confirmation; do not loop on taste after that. Tell the user what you fixed and what you would still change.

## When Chrome is missing

Builds and `check.mjs` work without Chrome. `capture.mjs` and `sheet.mjs` exit 1 with `Chrome not found (set CHROME_PATH)`. They look for Chrome or Chromium in the usual places on Linux, macOS and Windows; set `CHROME_PATH` to the binary for any other place. In a sandboxed agent (Codex), Chrome may be blocked; ask the user to allow the command or to run it themselves, and say that the page is built but not visually checked.
