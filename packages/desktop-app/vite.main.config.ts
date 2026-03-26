import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: resolve(process.cwd(), "src/main/main.ts"),
			formats: ["es"],
			fileName: () => "index.js",
		},
		outDir: resolve(process.cwd(), "dist/main"),
		emptyOutDir: true,
		rollupOptions: {
			external: [
				"electron",
				"node-cron",
				...builtinModules,
				...builtinModules.map((m) => `node:${m}`),
			],
		},
		minify: false,
		sourcemap: true,
	},
});
