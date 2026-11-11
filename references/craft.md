# Craft

The rules behind a page that reads like manga rather than a set of renders. `SKILL.md` has the short form; this is the reasoning.

## A page is a sequence, not a gallery

A reader takes a page in two passes: one glance at the whole layout, then panel by panel in reading order. The first pass decides the mood (how much black, how big the biggest panel, how calm the gutters); the second tells the story. Plan both.

- **One question per panel.** Where are we? Who is here? What did she say? How does he take it? What happens next? A panel that answers none of them is cut.
- **Time lives in the gutters.** A wide gutter or a silent panel slows the reader; tight, small panels speed them up. A conversation can breathe; a fight cannot.
- **Turn the page on a question.** The last panel (bottom left in `rtl`) sets up the next page: a look, a line left hanging, a door opening.

## Composition inside a panel

- **Thirds.** Put the subject's eyes on a third line, not dead centre. Use `cx` and `cy` to place the camera target.
- **Look room.** Leave space on the side a character faces or speaks towards; the bubble goes there.
- **Overlap for depth.** Near things overlapping far things read as space. In a two-shot, let the near shoulder cut into the frame.
- **Silhouette.** A pose should read as a black shape. If arms disappear against the body, turn the camera or the pose.
- **Horizon and floor.** In wide shots, show where the floor is; in close-ups, the background can be pure tone or lines.

## Shot variety

- Mix at least three shot sizes on a page (wide, medium, close or extreme close).
- Move the camera between neighbouring panels: a different yaw (0.3 radians or more), a different pitch or a different size.
- Use the biggest panel for the place or the beat, never for a talking head with nothing happening.
- Keep the axis: in a conversation, each character stays on their side of the frame from panel to panel.
- Close-ups are cheap in this kit: an actor without a set renders fast and gets more ink per centimetre. Use them for every emotional turn.

## Where blacks go

Black is the strongest thing on a page. It pulls the eye, so place it.

- Frame the subject: a lit face against black hair or a night sky; a white figure against a dark doorway.
- Balance across the page: no tier entirely grey, no corner a black slab with nothing in it. `check.mjs` holds each panel inside the style's black range; the page balance is yours to judge.
- Keep large blacks off the middle of a face in a calm beat. A half-black face (low side light) is for menace or a turning point.
- Hair is the free black of manga. `hair: 'black'` gives a solid mass with a white shine band; let it carry the darks of a close-up.

## Tone or hatching

- **Screentone** says smooth, soft, calm, or far away: skin, cloth, sky, walls in a quiet scene, a memory.
- **Hatching** says rough, hard, old, or under strain: metal, stone, wood, shadows in a tense scene.
- Never both on one surface; the style's `toneMats` decides which materials take tone.
- More hatching means more weight and more age. The knight is hatched densely; the rooftop is almost all tone.

## Lettering

- Bubbles follow the reading order; the first line of a panel is at its top right (`rtl`).
- Never a bubble over a face or a hand, never a tail across a character.
- Tails toward the chin: aim at the head bone and the kit stops short of the face.
- Short lines. Manga dialogue is clipped: "...This Sunday?" not "Wait, do you mean this coming Sunday?".
- Sound effects are drawing, not text: big, rotated, near the source.

## Characters

- **Same model, same character.** Never swap models between panels for the same person.
- **Acting is face and hands.** Plan the expression of every panel in the script, and give every visible hand a shape.
- **Props seated in hands.** Attach held props to the hand bone and check the grip at 4x. A gap between fingers and grip, or a grip through the back of the hand, is the most visible fault on a page.
- **Weight and contact.** Feet on the floor (set `root.pos[1]` to the ground height), a seated figure on a seat. Characters touching each other are not proved yet; keep a little space.

## Sets

- A set has a floor, a far boundary (a wall, a railing, a skyline) and at least three objects that say where we are.
- A hero object (the thing a panel is about) has at least 40 named parts: the knight has helm, breastplate, pauldrons, gauntlets, fauld, greaves, sabatons, shield, cape, poleaxe and their sub-parts.
- Name every part with a dotted path (`roof.tank.leg.2`) so the viewer and the rework can find it.
- The camera is orthographic: distance does not shrink things. Build far things small (the rooftop skyline is a row of boxes whose tops are only 0.6 to 1.35 m above the roof, set 2.4 to 4.6 m back).
- Seed every random choice with stable keys (`rngFor('rooftop', 'skyline', i)`), one stream per object.

## Light

- One key light per scene, placed for the mood: low and to the side for dusk and threat, high and frontal for daylight and calm.
- Close-ups may cheat the key light towards the camera for a clean face (`faceLight` in `examples/rooftop/page.mjs`); readers do not notice, and a face in clean white with tone shadow reads better than a face half in black.
- Centre the shadow map on what matters (`light.target`) and raise `light.scale` for close-ups so the shadow edges are sharp.

## Check every PNG

Every screenshot you take, you open and look at. The scripts check numbers; you check the story, the acting and the craft.
