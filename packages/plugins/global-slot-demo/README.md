# Global Slot Demo Plugin

This example demonstrates a trusted desktop UI plugin that renders through Vetta's global slot.

## Build

```bash
cd packages/plugins/global-slot-demo
bun install
bun run pack
```

The installable archive is written to:

```text
packages/plugins/global-slot-demo/release/global-slot-demo-0.1.0.zip
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
- React is shared by the desktop host through Module Federation, so it is a plugin development dependency only.
- `@vetta/plugin-sdk` is provided by the host and remains external.
- The plugin declares `ui.slot.global`; without this grant, `ctx.ui.registerGlobalSlot()` will fail.
- CSS is scoped under `.vetta-plugin-global-slot-demo` and uses Vetta theme variables.
