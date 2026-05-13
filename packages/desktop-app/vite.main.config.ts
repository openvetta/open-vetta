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
					// Photon-node ships as CJS with __dirname-based WASM loading.
					// Inlining it into this ESM bundle makes Node interpret its .js
					// as ESM (because desktop-app/package.json has "type":"module"),
					// which breaks __dirname and silently disables image resize ->
					// large images reach the model at original resolution and OOM
					// local VL backends.
					"@silvia-odwyer/photon-node",
					// dbus-next lazily requires x11 only for legacy DBus address
					// discovery. Bundling turns that into startup-time resolution.
					"dbus-next",
				],
			},
			minify: false,
			sourcemap: true,
		},
	};
});
