import { resolve } from "node:path";
import { defineConfig, type UserConfig } from "vite";

const preloadEntries = {
	index: "src/preload/index.ts",
	pet: "src/preload/pet.ts",
	onboarding: "src/preload/onboarding.ts",
	"remote-desktop": "src/preload/remote-desktop.ts",
} as const;

export default defineConfig((): UserConfig => {
	const entryName = process.env.VETTA_PRELOAD_ENTRY;
	if (!entryName || !(entryName in preloadEntries)) {
		throw new Error(`Invalid VETTA_PRELOAD_ENTRY: ${entryName ?? "missing"}`);
	}
	const preloadEntryName = entryName as keyof typeof preloadEntries;
	return {
		build: {
			lib: {
				entry: resolve(process.cwd(), preloadEntries[preloadEntryName]),
				formats: ["cjs"],
				fileName: () => `${preloadEntryName}.js`,
			},
			outDir: resolve(process.cwd(), "dist/preload"),
			emptyOutDir: preloadEntryName === "index",
			sourcemap: false,
			rollupOptions: {
				external: ["electron"],
				output: {
					inlineDynamicImports: true,
				},
			},
		},
	};
});
