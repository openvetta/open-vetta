# SVG Viewer Plugin

A trusted Vetta **system plugin** (ADR-0024) that previews `.svg` files in the
activity panel file preview, demonstrating the **file preview slot**
(`ui.slot.file-preview`).

Features:
- Rendered / source toggle
- Zoom controls over a checkerboard backdrop
- Renders via a `data:` URL (scripts inside the SVG do not execute)

`svg` is intentionally removed from the host's built-in image preview set so this
plugin can claim it (the file preview slot is "fill the blanks" only — plugins
cannot override built-in previews).

## System plugin

This lives under `packages/plugins/presets/`, so it ships with the app as a
system plugin (auto-enabled, permissions auto-granted, users cannot delete or
modify it). It is built by `bun run build:presets` from `packages/desktop-app`
(run automatically by `dev` / `start` / packaging); no manual install needed.

To iterate standalone:

```bash
bun install
bun run build   # writes dist/ (read in-place in dev)
```
