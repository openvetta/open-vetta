import { vettaPluginFederation } from "@vetta/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		vettaPluginFederation({
			name: "guiding_words",
			entry: "./src/index.tsx",
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
});
