import tailwindcss from "@tailwindcss/vite";
import { vettaPluginFederation } from "@vetta/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vettaPluginFederation({
			name: "lottie_studio",
			entry: "./src/index.tsx",
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
	// canvaskit.wasm (~7MB) must stay an emitted asset (never inlined), so it is
	// packaged under dist/assets/ and fetched at runtime via locateFile().
	build: {
		assetsInlineLimit: 0,
	},
});
