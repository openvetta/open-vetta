# Global Slot Demo Plugin

This example demonstrates a trusted desktop UI plugin that renders through Vetta's global slot.
It also shows the current agent contribution manifest shape for prompt blocks, skill paths, tool policies, and a JS-registered agent tool.

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
  grantedPermissions: [
    "ui.slot.global",
    "agent.systemPrompt.write",
    "agent.skills.control",
    "agent.tools.control",
    "agent.tools.register",
    "agent.toolHandler.execute",
    "fs.read",
    "fs.write"
  ]
});
await window.vetta.plugins.setEnabled("global-slot-demo", true);
```

The settings page can also install and enable the generated zip from the plugin management UI.

## Notes

- The plugin is built as a Module Federation remote and exposes `./plugin`.
- `@vetta/plugin-vite` supplies the default Vite Module Federation and Rollup configuration for Vetta plugins.
- `plugin.json` declares an `agent` section:
  - `agent.systemPrompt.promptPaths` injects `agent/prompts/fiction-system.md` as a separate system prompt block.
  - `agent.skillPaths` contributes `agent/skills/fiction-outline/SKILL.md` to the skill loader.
  - `agent.toolPolicy.deny` hides `doc_to_pdf` from the active tool set as a low-risk example.
- `src/index.tsx` registers `novel_write_chapter_file` at activation time. The tool schema is authored with `@sinclair/typebox`, and the handler writes through the host-controlled `api.fs.writeFile(...)` bridge.
- Tailwind CSS is compiled inside the plugin through `@tailwindcss/vite`; only utilities are imported, so the plugin does not inject Tailwind Preflight into the host.
- React is shared by the desktop host through Module Federation, so it is a plugin development dependency only.
- `@vetta/plugin-sdk` is provided by the host and remains external.
- The plugin declares `ui.slot.global`, `agent.systemPrompt.write`, `agent.skills.control`, `agent.tools.control`, `agent.tools.register`, `agent.toolHandler.execute`, `fs.read`, and `fs.write`; without these grants, the corresponding UI, agent contribution, tool registration, or file operation is ignored.
- Tailwind classes reference Vetta CSS variables such as `--primary` and `--popover`, so the plugin follows the active host theme.
