import tailwindcss from "@tailwindcss/vite";
import { vettaPluginFederation } from "@vetta-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vettaPluginFederation({
			name: "cowart_vetta",
			entry: "./src/index.tsx",
			package: true,
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
	optimizeDeps: {
		include: ["tldraw", "@tldraw/assets", "html2canvas", "lucide-react"],
	},
	build: {
		// Cowart canvas is large; keep chunks within reason for desktop MF load.
		chunkSizeWarningLimit: 4000,
	},
});
