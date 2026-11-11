# Contributing to mangaka

Thank you for helping. mangaka is judged by how its pages read at 1x and how its ink holds at 4x, so most of this guide is about checking your work before anyone else does.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need:

- **Node.js 20.10 or later.** Nothing to install: the kit, the scripts and the tests use only Node's built-in modules.
- **Google Chrome or Chromium** for the screenshot scripts and the capture test. The scripts find it in the usual places; otherwise set `CHROME_PATH` to the binary. Without Chrome the capture test is skipped.
- **Claude Code**, Codex, OpenCode, Antigravity or MiniMax Code, to try the skill itself.

```sh
git clone https://github.com/justinjd00/mangaka.git
cd mangaka
```

To use your working copy as the skill while you change it, link it into your personal skills folder (move any installed copy out of the way first):

```sh
ln -s "$PWD" ~/.claude/skills/mangaka
```

For Codex use `~/.agents/skills/mangaka`, for OpenCode `~/.config/opencode/skills/mangaka`, for Antigravity `~/.gemini/antigravity/skills/mangaka`, for MiniMax Code `~/.minimax/skills/mangaka`.

## Tests

```sh
npm test
```

This runs `node --test` over `tests/`: the distance fields, raster, VRM loader, poses, ink determinism and locality, lettering, page build, cache, viewer, rework and checks. It takes about a minute.

## Building the examples

Each example is a page file; the built pages are committed.

```sh
node scripts/build.mjs examples/gate/page.mjs --no-cache
node scripts/build.mjs examples/rooftop/page.mjs --no-cache
node scripts/build.mjs examples/duel/page.mjs --no-cache
```

Each takes one to two minutes cold. Without `--no-cache`, unchanged panels come from `examples/<name>/.mangaka/cache` (ignored by git). After a build, `git status --short` must show nothing unless you meant to change a page.

## The checks

Every example must pass:

```sh
node scripts/check.mjs examples/gate
node scripts/check.mjs examples/rooftop
node scripts/check.mjs examples/duel
node scripts/fingerprint.mjs examples/rooftop/page.mjs
```

For a visual change, capture the page and a contact sheet and read them. Put screenshots in `shots/`, which is ignored:

```sh
node scripts/capture.mjs examples/duel --out shots
node scripts/capture.mjs examples/duel --panel shout --zoom 4 --out shots
node scripts/sheet.mjs examples/duel --out shots/sheet.png
```

For a change to the rework path, run a rework on a copy of an example and prove it with `scripts/diff.mjs`; `references/rework.md` shows the commands. CI runs the tests, rebuilds every example with `--no-cache`, checks each one and runs the fingerprint on Node 20 and 22.

## House rules

A pull request that breaks one of these will be asked to change.

- **Zero dependencies.** Node built-ins only, ESM `.mjs`. No `node_modules`, no build step. `package.json` exists for `"type": "module"` and the test script.
- **Determinism.** The same page file builds to byte-identical SVG on any machine. No `Math.random`, no `Date`, nothing locale-dependent in anything that reaches an output file. All randomness comes from `kit/rng.mjs`, seeded from stable keys, and ink in one screen region must not depend on a random sequence used elsewhere.
- **Kit changes keep the examples.** A change to `kit/` either leaves every committed page byte-identical, or the pull request says which pages change and why and commits the rebuilt pages.
- **Original characters only.** Examples, docs and issues use original characters and original pages. No named characters from other works, no reproduction of existing manga pages.
- **CC0 models only.** A model added to `models/` must say CC0 in its own VRM metadata (`licenseName`), with its licence fields recorded in `models/README.md`. Models are never modified.
- **Examples must pass `check.mjs`**, and every example's page must stay under 2 MB.
- **Read every PNG.** Look at the page and close-ups of what you changed before asking for a review.

## Changing the skill's text

`SKILL.md` and `references/` are instructions an agent follows, so keep them short, exact and plain: no em dashes, no marketing words, no rhetorical questions. When you change a kit API, update [`references/kit.md`](references/kit.md) in the same pull request. When you add an example, give it a folder under `examples/` with a `page.mjs`, commit its built output, and add it to the list in `SKILL.md`, the gallery in the README and the build steps in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Pull requests

1. Open an issue first for anything larger than a fix, so we can agree on the approach.
2. Fork the repository and branch from `main`.
3. Make one change per pull request.
4. Run `npm test`, rebuild every example and run the checks.
5. Attach before and after screenshots for any visual change.
6. Add a line under `Unreleased` in [`CHANGELOG.md`](CHANGELOG.md).
7. Fill in the pull request template.

CI must pass before a merge.

## Reporting a bug or asking for a page

Use the [issue forms](https://github.com/justinjd00/mangaka/issues/new/choose). For a page that came out wrong, include the prompt, the page file if you can share it, and a close-up of the fault.
