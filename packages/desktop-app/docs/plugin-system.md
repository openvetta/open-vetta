# Desktop Plugin System

The desktop app can load trusted external UI plugins after the app has already been packaged.

## Package Layout

Plugins are installed from a zip archive. The archive must contain `plugin.json` at the root, or contain one top-level folder with `plugin.json` inside it.

```text
my-plugin.zip
  plugin.json
  dist/
    index.js
    style.css
```

## Manifest

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "pluginApiVersion": "^1.0.0",
  "entry": "dist/index.js",
  "styles": ["dist/style.css"],
  "permissions": ["ui.slot.global"]
}
```

Installed plugin files are stored by version:

```text
~/.vetta/plugins/my-plugin/versions/0.1.0/
```

Installing a newer version records it as pending. The app keeps loading `activeVersion` until the user triggers `window.vetta.plugins.reload(id)`.

## Runtime Entry

```tsx
import { useState } from "vetta-host://react";
import { jsx, jsxs } from "vetta-host://react/jsx-runtime";
import { definePlugin } from "vetta-host://plugin-sdk";

function PluginRoot() {
  const [open, setOpen] = useState(true);
  return open ? jsx("div", { className: "vetta-plugin-my-plugin", children: "Hello" }) : null;
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

When using Vite/Rollup, map these dependencies to host modules instead of bundling React:

```ts
resolve: {
  alias: {
    react: "vetta-host://react",
    "react/jsx-runtime": "vetta-host://react/jsx-runtime",
    "react/jsx-dev-runtime": "vetta-host://react/jsx-dev-runtime",
    "@vetta/plugin-sdk": "vetta-host://plugin-sdk"
  }
}
```

Other dependencies may be bundled into the plugin.

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
