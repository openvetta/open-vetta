# Excalidraw Viewer Plugin

A trusted Vetta desktop plugin that previews `.excalidraw` files in the activity
panel file preview, using the **file preview slot** (`ui.slot.file-preview`).

Features:
- Offline rendering — the scene is rasterized to SVG via `@excalidraw/excalidraw`'s
  `exportToSvg`, bundled into the plugin (no network access required).
- Rendered / source toggle (rendered diagram vs raw JSON).
- Fit-to-view by default, with zoom buttons and mouse-wheel zoom.
- Drag to pan the canvas.
- White / black background switch (defaults to white).
- Export to PNG — `exportToBlob` at 2x with the chosen background baked in.
- Live refresh — re-renders when the `.excalidraw` file changes on disk.

`excalidraw` is not in the host's built-in preview set, so this plugin can claim
it (the file preview slot is "fill the blanks" only — plugins cannot override
built-in previews).

## This is NOT a system plugin

It lives under `packages/plugins/externals/` (not `presets/`), so it ships as a
**user-installable** plugin: the user installs the zip, grants
`ui.slot.file-preview`, and can disable or remove it.

## Build

```bash
cd packages/plugins/externals/excalidraw-viewer
bun install --cwd ../..
bun run build
```

The installable archive is written to:

```text
packages/plugins/externals/excalidraw-viewer/release/excalidraw-viewer-<version>.zip
```

`@vetta-org/plugin-vite` creates the archive automatically after `vite build`; no
separate packaging script is required.

## Install From Renderer DevTools

After opening the desktop app, run:

```js
const file = await window.showOpenFilePicker({
  types: [{ description: "Vetta plugin", accept: { "application/zip": [".zip"] } }]
});
const buffer = await (await file[0].getFile()).arrayBuffer();
await window.vetta.plugins.installFromArchive(buffer, {
  grantedPermissions: ["ui.slot.file-preview"]
});
await window.vetta.plugins.setEnabled("excalidraw-viewer", true);
```

The settings page can also install and enable the generated zip from the plugin
management UI.

## Notes

- React is shared by the desktop host through Module Federation, so it is a
  plugin development dependency only.
- `@vetta-org/plugin-sdk` is provided by the host and remains external.
- Text fonts fall back to a system font if Excalifont cannot be loaded offline;
  shape rendering is unaffected.
