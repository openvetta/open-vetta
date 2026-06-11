# Desktop Plugin System

The desktop app can load trusted external UI plugins after the app has already been packaged.

## Package Layout

Plugins are installed from a zip archive. The archive must contain `plugin.json` at the root, or contain one top-level folder with `plugin.json` inside it.

```text
my-plugin.zip
  plugin.json
  dist/
    mf-manifest.json
    remoteEntry.js
    style.css
```

## Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "pluginApiVersion": "^1.0.0",
  "runtime": "module-federation",
  "entry": "dist/mf-manifest.json",
  "moduleFederation": {
    "remoteName": "my_plugin",
    "expose": "./plugin"
  },
  "styles": ["dist/style.css"],
  "permissions": ["ui.slot.global"]
}
```

Installed plugin files are stored by version:

```text
~/.vetta/plugins/my-plugin/versions/0.1.0/
```

Installing a newer version records it as pending. The app keeps loading `activeVersion` until the user triggers `window.vetta.plugins.reload(id)`.

## Module Federation Entry

```tsx
import { definePlugin } from "@vetta/plugin-sdk";
import { useState } from "react";

function PluginRoot() {
  const [open, setOpen] = useState(true);
  return open ? <div className="vetta-plugin-my-plugin">Hello</div> : null;
}

export default definePlugin({
  activate(ctx) {
    ctx.ui.registerGlobalSlot({
      id: "root",
      component: PluginRoot
    });
  }
});
```

The host loads `runtime: "module-federation"` plugins through `@module-federation/enhanced/runtime`.
The plugin should expose its definition through the configured `moduleFederation.expose`.
React and React DOM are shared as host singletons.

Example Vite configuration:

```ts
import { vettaPluginFederation } from "@vetta/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vettaPluginFederation({
      name: "my_plugin",
      entry: "./src/index.tsx"
    })
  ]
});
```

Other dependencies may be bundled into the plugin. `@vetta/plugin-sdk` is provided by the host and remains external.

Legacy `runtime: "esm"` plugins are still supported. They can continue to map `react`,
`react/jsx-runtime`, `react/jsx-dev-runtime`, and `@vetta/plugin-sdk` to `vetta-host://` modules.

## Permissions

Plugins must declare permissions in `plugin.json`. The host grants permissions separately and checks them at runtime.

The first supported UI permission is:

```text
ui.slot.global
```

Without it, `ctx.ui.registerGlobalSlot()` throws `Plugin permission denied: ui.slot.global`.

## Styling

Plugins should use Vetta CSS variables and avoid global selectors:

```css
.vetta-plugin-my-plugin {
  color: var(--foreground);
  background: var(--background);
  border-color: var(--border);
}
```

Do not style `body`, `button`, `*`, or other global selectors from plugin CSS.
