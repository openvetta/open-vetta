import tailwindcss from "@tailwindcss/vite";
import { vettaPluginFederation } from "@vetta/plugin-vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vettaPluginFederation({
			name: "media_viewer",
			entry: "./src/index.tsx",
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
	resolve: {
		alias: {
			"@vetta/ui": resolve(__dirname, "../../../ui/src/index.ts"),
		},
	},
});
