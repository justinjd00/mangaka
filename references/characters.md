# Characters

Characters are anime models in the VRM format, rendered into the same buffers as the code-built set and inked by the same engine. A character is the same model in every panel, so her face, hair and clothes hold from any camera. This guide covers casting, placing, posing, expressions, hands, props in hands, hair, part names and bringing your own model.

## Casting

Two CC0 models ship in `models/` (see `models/README.md` for their licence fields):

| File | Look | Used in |
|---|---|---|
| `models/fumiriya.vrm` | A boy with short black hair, white shirt, dark vest and trousers. | `boy` in all three examples |
| `models/shino.vrm` | A girl with long straight black hair and bangs, school blouse with a bow, pleated skirt. | `girl` in `examples/rooftop/` |

Both are VRoid Studio models, so they share the VRoid family look. A story with more characters needs more models; write that into the plan and ask the user for them. Do not fake a second character by reusing one model with a different expression: readers notice.

Give every actor a short, stable `name` (`boy`, `girl`, `mio`). It prefixes all its part names and is the key in `bones` and in bubble tails.

## Placing

`root: { pos: [x, y, z], yaw }` puts the actor on the set: `pos` is the point between the feet, in metres, `yaw` turns it about Y. Yaw 0 faces +Z. Two characters facing each other at a distance `d` along X:

```js
const boyRoot = { pos: [-0.5, 0, 0.05], yaw: 1.3 };   // turned towards +X, a little towards the camera
const girlRoot = { pos: [0.5, 0, 0.05], yaw: -1.3 };
```

On uneven ground, set `pos[1]` to the ground height under the feet; `examples/duel/page.mjs` computes it from the mound with `groundAt(x, z)`. A seated actor (`POSES.sit`) needs `pos[1]` lowered by about 0.45 m and a seat under it (`bench` in `kit/parts/props.mjs` returns its `seat` point).

Write the actor once as a function and reuse it, so every panel gets the same model, root and pose unless you mean otherwise:

```js
const girl = (expr = {}) => ({ name: 'girl', model: '../../models/shino.vrm', pose: girlPose, root: girlRoot, expr });
// panels: actors: [girl({ sorrow: 0.55 })]
```

## Posing

A pose maps humanoid bone names to Euler rotations `[x, y, z]` in radians, applied on top of the model's rest pose (a T-pose). Start from the library and change a few bones:

```js
import { POSES } from '../../kit/poses.mjs';

const boyPose = { ...POSES.stand, head: [-0.05, 0.05, 0] };
const girlPose = { ...POSES.relaxed, head: [0.05, 0.12, -0.04] };
```

`POSES`: `tpose`, `stand`, `relaxed` (weight on one leg), `guard` (fists up), `reach` (right arm forward), `walk`, `run`, `sit`.

Bones: `hips`, `spine`, `chest`, `upperChest`, `neck`, `head`, `leftShoulder`, `leftUpperArm`, `leftLowerArm`, `leftHand`, the same on the right, `leftUpperLeg`, `leftLowerLeg`, `leftFoot`, `leftToes`, the same on the right, `leftEye`, `rightEye`, and three joints per finger (`leftIndexProximal`, `leftIndexIntermediate`, `leftIndexDistal`, and `Thumb`, `Middle`, `Ring`, `Little`).

Sign rules for the bundled models:

- Upper arms: positive Z lowers the left arm from the T-pose, negative Z lowers the right. About 1.2 brings an arm to the side.
- Swinging an upper arm forward is -Y on the left and +Y on the right.
- Bending an elbow: the lower arm's Y, negative on the left, positive on the right.
- Legs: positive X on an upper leg lifts the thigh forward; negative X on a lower leg bends the knee back.
- Head: X nods, Y turns, Z tilts. Keep each under about 0.3 and check the result in a close-up; the examples use values like `[-0.05, 0.05, 0]` and `[0.05, 0.12, -0.04]`.

`mixPose(a, b, t)` blends two poses, `mirrorPose(p)` swaps sides. For a hand that must land on a point (a sword striking a shield), the duel example fits arm rotations until the hand bone reaches the target; measure with a bones-only pose (`poseVRM(model, { pose, root, skin: false })` returns `bonePos` without skinning, fast).

Pose rules:

- Weight. One hip higher, the head over the supporting foot. `stand` is stiff; `relaxed` is the default for talking.
- The head leads. Turn the head towards whoever the character is listening to, even if the body is not.
- Hands are acting. Give every visible hand a shape (`hands: { left: 'relaxed' }` at least).
- Check a new pose from two cameras before you commit to it; a pose that reads from the front can be broken from the side.

## Expressions

`expr` maps blend shape names to weights from 0 to 1, and they mix:

| Shape | Use |
|---|---|
| `joy` | Smile, eyes curved. Use 0.3 to 0.6 for warmth; 1 closes the eyes. |
| `angry` | Brows down. 0.8 to 1 with `a` or `i` for a shout. |
| `sorrow` | Brows up and inward. 0.4 to 0.6 for sadness that is held back. |
| `fun` | A soft closed-mouth smile. |
| `surprised` | Eyes wide, brows up. |
| `blink`, `blink_l`, `blink_r` | Closed eyes, or a wink. |
| `a`, `i`, `u`, `e`, `o` | Mouth shapes: `a` open, `i` wide teeth, `u` small round, `e` half open, `o` round. |

From the examples: `{ surprised: 1, a: 0.25 }` for shock, `{ angry: 1, i: 0.5 }` for clenched resolve, `{ angry: 1, a: 0.9 }` for a shout, `{ joy: 0.35, sorrow: 0.25 }` for a sad smile, `{ sorrow: 0.55 }` for bad news.

A face has three expressions a page needs most: neutral, the reaction, and the after. Plan them per panel in the script.

## Hands

`hands: { left, right }` on an actor replaces the finger bones of its pose. Names from `HANDS`: `open`, `relaxed`, `fist`, `point`, `grip`, `hilt` (closed round a sword grip about 0.023 m thick). A hand shape can also be written out: `{ Index: [a, b, c], Middle, Ring, Little, thumb: [[x, y, z] x 3] }` with curl angles per joint.

Close-ups of hands are where a page shows its quality; `examples/gate/` has a fist close-up (`grip` panel) at camera scale 2050.

## Props in hands

A held prop is built in the hand bone's frame, so it follows the pose in every panel. Hand frames of the bundled models (from `kit/attach.mjs`): on `rightHand`, +X runs along the fingers, -Y is the palm normal, -Z points to the thumb side; on `leftHand`, -X runs along the fingers. A sword grip of radius 0.0115 sits at `[0.065, -0.032, 0]` in a right hand closed with `hilt`, running along Z, blade towards -Z: place it with `R: rotX(-PI / 2)`.

```js
import * as S from '../../kit/sdf.mjs';
import { boneFrame, attachTo } from '../../kit/attach.mjs';
import { sword } from '../../kit/parts/weapons.mjs';

const GRIP = { at: [0.065, -0.032, 0], R: S.rotX(-Math.PI / 2), blade: 0.5, grip: 0.13, gripR: 0.0115, guard: 0.07, width: 0.02 };
const withSword = base => ({ actors }) => {
  const sc = base ? base() : S.scene();
  attachTo(sc, boneFrame(null, actors.boy.result, 'rightHand'), local => sword(local, 'boy.sword', GRIP));
  return sc;
};
```

The panel then uses `scene: withSword(buildKnight)` and the actor `hands: { right: 'hilt' }` (or a pose made with `withHands(..., { right: 'hilt' })`). Pass `null` as the model to `boneFrame` so a cached build never loads the model. Size props to the character: the boy's arm from shoulder to fingertip is about 0.63 m, so his sword blade is 0.5 m. Then check the grip in a 4x close-up (`capture.mjs <dir> --part boy.sword.grip --zoom 4`): no gap between fingers and grip, no grip poking through the back of the hand.

## Hair

`hair: 'black'` (default) inks hair as solid black with a white shine band where it faces the light; this is the classic manga look and suits dark-haired characters. `hair: 'light'` inks it as open white with a soft shadow side and strand lines, for blond or pale hair. Hair strips keep separate part ids, so their edges become strand lines either way. Per panel, `shade: { shineAt }` moves the shine band (the world normal height where it peaks, default 0.45).

## Part names

`<actor>.skin`, `<actor>.hair.<n>` (one per strip; the viewer groups them as `<actor>.hair`), and one part per remaining material: on the VRoid models `Tops`, `Bottoms`, `Shoes`, `AccessoryNeck`, `FaceBrow`, `FaceEyeline`, `FaceEyelash`, `FaceMouth`, `EyeIris`, `EyeWhite`, `EyeHighlight`, `EyeExtra`. List the actor parts of each panel (here for the actors `boy` and `girl`) with:

```sh
node -e "const m=require('./examples/rooftop/page.map.json');for(const p of m.panels)console.log(p.id, p.parts.filter(n=>/^(boy|girl)\./.test(n)&&!/hair\.\d/.test(n)).join(' '))"
```

Face parts ink straight from the model's textures (black, white and tone by luminance), skin as white with a tone shadow, clothes by texture brightness. A dark cloth texture with baked wrinkles can sit right at the black threshold and come out blotchy; `examples/rooftop/page.mjs` fixes this on the boy's vest with a region that raises `black` (see `references/ink.md`).

## Bring your own VRM

1. **Make or get a model.** VRoid Studio (free, Windows and macOS) makes anime characters from sliders and presets. Any VRM 0.x file the user has the rights to works.
2. **Export as VRM 0.x.** In VRoid Studio, use the VRM export and choose VRM 0.0 when the version offers 0.0 and 1.0. The loader rejects VRM 1.0 with "VRM 1.0 is not supported yet; export as VRM 0.x". Fill in the title and author in the export dialog.
3. **Check the licence.** Read the file's own metadata before you use it:

   ```sh
   node -e "import('./kit/vrm.mjs').then(({ loadVRM }) => { const m = loadVRM(process.argv[1]).meta; console.log(m.title, '|', m.author, '|', m.licenseName, '|', m.allowedUserName, '|', m.commercialUssageName, '|', m.otherLicenseUrl); })" models/shino.vrm
   ```

   Run it from the skill folder with the user's path in place of `models/shino.vrm`. Tell the user what it says. If the user made the model, it is theirs. If it is someone else's, use it only if `allowedUserName` and the licence permit it, and never commit it to this repository: `models/` holds CC0 files only.
4. **Point the page at it.** `model: '../models/aoi.vrm'`, relative to the page folder.
5. **Test it.** One close-up panel with `expr: {}` and one with `{ joy: 0.6 }`, `ss: 1.4`, `shade: { aoRadius: 0.02 }`. Look at the eyes (do the iris and highlight read?), the mouth, the hair shine and the clothes. If the hair is pale, add `hair: 'light'`. Material names follow VRoid's naming (`..._HAIR`, `_SKIN`, `_CLOTH`, `_FACE`, `_EYE`); a model from another tool with different names inks its surfaces as cloth, which may need a `regions` fix or a different model.

## Original characters

Make original characters. When a user shows a reference character, take only technique (how the hair is massed, how dense the blacks are, the camera habits) and design something of their own. Never rebuild a named character from someone else's work, and say so when asked.
