# SVG Viewer Plugin

A trusted Vetta desktop plugin that previews `.svg` files in the activity panel
file preview, demonstrating the **file preview slot** (`ui.slot.file-preview`).

Features:
- Rendered / source toggle
- Zoom controls over a checkerboard backdrop
- Renders via a `data:` URL (scripts inside the SVG do not execute)

`svg` is intentionally removed from the host's built-in image preview set so this
plugin can claim it (the file preview slot is "fill the blanks" only — plugins
cannot override built-in previews).

## Build

```bash
bun install
bun run build   # writes dist/ and the packaged .vetta archive
```

Install the produced archive from the desktop app's plugin manager, grant the
`ui.slot.file-preview` permission, then open any `.svg` from the file tree.
