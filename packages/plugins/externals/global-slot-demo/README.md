# Global Slot Demo Plugin

This example demonstrates a trusted desktop UI plugin that renders through Vetta's global slot.

## Build

```bash
cd packages/plugins/externals/global-slot-demo
bun install --cwd ../..
bun run build
```

The installable archive is written to:

```text
packages/plugins/externals/global-slot-demo/release/global-slot-demo-0.1.0.zip
```

The archive contains only runtime files required by the desktop host. Module Federation build metadata remains in `dist/` for diagnostics, but is not included in the zip.
`@vetta/plugin-vite` creates the archive automatically after `vite build`; no separate packaging script is required.

## Install From Renderer DevTools

After opening the desktop app, run:

```js
const file = await window.showOpenFilePicker({
  types: [{ description: "Vetta plugin", accept: { "application/zip": [".zip"] } }]
});
const buffer = await (await file[0].getFile()).arrayBuffer();
await window.vetta.plugins.installFromArchive(buffer, {
  grantedPermissions: ["ui.slot.global"]
});
await window.vetta.plugins.setEnabled("global-slot-demo", true);
```

The settings page can also install and enable the generated zip from the plugin management UI.

## Notes

- The plugin is built as a Module Federation remote and exposes `./plugin`.
- `@vetta/plugin-vite` supplies the default Vite Module Federation and Rollup configuration for Vetta plugins.
- Tailwind CSS is compiled inside the plugin through `@tailwindcss/vite`; only utilities are imported, so the plugin does not inject Tailwind Preflight into the host.
- React is shared by the desktop host through Module Federation, so it is a plugin development dependency only.
- `@vetta/plugin-sdk` is provided by the host and remains external.
- The plugin declares `ui.slot.global`; without this grant, `ctx.ui.registerGlobalSlot()` will fail.
- Tailwind classes reference Vetta CSS variables such as `--primary` and `--popover`, so the plugin follows the active host theme.
