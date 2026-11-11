# Changelog

All notable changes to mangaka are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-11

First release.

### Added

- `kit/sdf.mjs`: forms as distance fields with plain-data descriptions (sphere, ellipsoid, round cone, cylinder, capped cone, box; union, smooth union, subtract, smooth subtract, intersect, round, shell, transform, squash, mirror, displacement) and `scene()` for named parts and decals.
- `kit/vrm.mjs` and `kit/mesh.mjs`: a pure Node VRM 0.x loader (GLB, PNG textures, skins, morph targets, humanoid bones, blend shape groups) and a triangle rasteriser that writes into the same buffers as the distance-field raster, so code-built forms and characters share depth and shadows.
- `kit/poses.mjs`: eight poses, six hand shapes, `withHands`, `mirrorPose` and `mixPose`. `kit/attach.mjs`: props attached to bones or any frame.
- `kit/parts/`: armour (helm, breastplate, pauldron, fauld, gauntlet, greave, sabaton, shield, cape), weapons (sword, poleaxe, spear, arrow), architecture (ground, wall, railing, stairs, column, rubble) and props (crate, lantern, bench).
- `kit/ink.mjs` and `kit/styles.mjs`: screentone in two densities, solid blacks, scanline and form-following hatching, pressure-varying brush outlines, drawn decals and hair strands, with every random draw seeded per panel, part, layer and screen cell; three styles (`seinen-dense`, `shonen-clean`, `tone-soft`) and per-panel regions.
- `kit/lettering.mjs`: speech, thought, shout and whisper bubbles, captions and sound effects measured with the metrics of the bundled Comic Neue and Bangers fonts; tails aimed at bones.
- `kit/backgrounds.mjs` and `kit/effects.mjs`: flat, gradient, split, storm sky, focus lines, speed lines; rain, snow and ink spatter.
- `kit/page.mjs`: page specs with insets and clip polygons, a panel cache keyed on everything that reaches a panel's ink, `page.svg`, `page.map.json`, `page.stats.json` and the viewer `page.html` with an edit mode that turns a dragged rectangle into a rework instruction.
- Scripts: `build`, `check`, `capture`, `sheet`, `rework`, `diff`, `fingerprint`.
- Examples: `gate`, `rooftop` and `duel`, with committed output.
- `SKILL.md`, nine references, evals, CI on Node 20 and 22, issue forms and README images.
- Two CC0 VRoid models in `models/`.
