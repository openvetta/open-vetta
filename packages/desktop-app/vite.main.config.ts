import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VETTA_");

	// 将 .env.production 中的 VETTA_* 变量内联到构建产物
	const define: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		define[`process.env.${key}`] = JSON.stringify(value);
	}

	return {
		define,
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
					...builtinModules,
					...builtinModules.map((m) => `node:${m}`),
				],
			},
			minify: false,
			sourcemap: true,
		},
	};
});
