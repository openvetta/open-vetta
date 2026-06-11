import { resolve } from "node:path";

export default {
	build: {
		outDir: "dist",
		emptyOutDir: true,
		lib: {
			entry: resolve(import.meta.dirname, "src/index.ts"),
			formats: ["es"],
			fileName: () => "index.js",
		},
		rollupOptions: {
			external: [/^vetta-host:\/\//],
			output: {
				assetFileNames: "style.css",
			},
		},
	},
};
