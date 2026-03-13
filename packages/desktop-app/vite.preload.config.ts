import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(process.cwd(), "src/preload/index.ts"),
			formats: ["cjs"],
			fileName: () => "index.js",
		},
		outDir: resolve(process.cwd(), "dist/preload"),
		emptyOutDir: true,
		rollupOptions: {
			external: ["electron"],
		},
	},
});
