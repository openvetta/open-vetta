# Draw.io Viewer Plugin

A trusted Vetta desktop plugin that previews `.drawio` / `.dio` diagrams in the
activity panel file preview, using the **file preview slot**
(`ui.slot.file-preview`).

Features:
- Offline rendering — the draw.io viewer engine (`viewer-static.min.js`) is
  bundled into the plugin, so no network access is required.
- Live refresh — watches the file's directory via `window.vetta.fs.watchDir` and
  re-reads + re-renders when the `.drawio` file changes on disk.
- Export to PNG — serializes the rendered SVG to a 2x PNG (labels render as SVG
  `<text>` so they survive the export).
- 渲染 / 源码 toggle (rendered diagram vs raw XML).
- Renders inside an isolated `<iframe>`, keeping the viewer's globals and CSS off
  the host.

`drawio` / `dio` are not in the host's built-in preview set, so this plugin can
claim them (the file preview slot is "fill the blanks" only — plugins cannot
override built-in previews). The bundled engine auto-renders any `.mxgraph`
element via `GraphViewer.processElements()`.

## This is NOT a system plugin

It lives under `packages/plugins/externals/` (not `presets/`), so it ships as a
**user-installable** plugin: the user installs the zip, grants
`ui.slot.file-preview`, and can disable or remove it.

## Build

```bash
cd packages/plugins/externals/drawio-viewer
bun install --cwd ../..
bun run build
```

The installable archive is written to:

```text
packages/plugins/externals/drawio-viewer/release/drawio-viewer-0.2.0.zip
```

`@vetta-org/plugin-vite` creates the archive automatically after `vite build`; no
separate packaging script is required. The archive is ~3.6 MB because the
offline viewer engine is bundled.

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
await window.vetta.plugins.setEnabled("drawio-viewer", true);
```

The settings page can also install and enable the generated zip from the plugin
management UI.

## Notes

- The vendored `src/vendor/viewer-static.min.js` is draw.io's static viewer
  build (v24.7.17). It is imported as a raw string and injected into the preview
  iframe at render time.
- A few stencil/style assets in the engine point at `viewer.diagrams.net`; the
  core shape rendering works fully offline, only some rare external stencils
  would need network.
- React is shared by the desktop host through Module Federation, so it is a
  plugin development dependency only.
- `@vetta-org/plugin-sdk` is provided by the host and remains external.
