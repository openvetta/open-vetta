import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: resolve(process.cwd(), "src/preload/index.ts"),
				pet: resolve(process.cwd(), "src/preload/pet.ts"),
			},
			formats: ["cjs"],
			fileName: (_format, entryName) => `${entryName}.js`,
		},
		outDir: resolve(process.cwd(), "dist/preload"),
		emptyOutDir: true,
		rollupOptions: {
			external: ["electron"],
		},
	},
});
