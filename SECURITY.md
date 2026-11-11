# Security

## What is in scope

mangaka is a set of instructions, a rendering kit and local Node scripts. A page file is JavaScript that the build script imports and runs, so build only page files you trust. The screenshot scripts (`capture.mjs`, `sheet.mjs`) run Chrome headless with `--no-sandbox` on local files; point them only at pages you built. The viewer `page.html` is a self-contained file that loads nothing from the network.

A security problem is anything in this repository that could let a page, a model file, a prompt or a viewer instruction run code, read files or reach the network in a way the user did not ask for: in the kit (the VRM and PNG decoders read untrusted files), in the scripts, in the built example pages, or in instructions in `SKILL.md` and `references/` that would lead an agent to do something unsafe.

## Supported versions

Only the latest commit on `main` is supported.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through GitHub's [private vulnerability reporting](https://github.com/justinjd00/mangaka/security/advisories/new) for this repository.

Include what you found, how to reproduce it, and what it could let someone do.
