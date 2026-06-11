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

Restart or reload the renderer to load enabled plugins.

## Notes

- React is imported from `vetta-host://react`, so the plugin uses the host React singleton.
- The plugin declares `ui.slot.global`; without this grant, `ctx.ui.registerGlobalSlot()` will fail.
- CSS is scoped under `.vetta-plugin-global-slot-demo` and uses Vetta theme variables.
