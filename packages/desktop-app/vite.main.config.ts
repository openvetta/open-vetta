import { builtinModules } from "node:module";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
	// 允许通过 VETTA_BUILD_ENV 覆盖构建模式，方便 dist:*:test 等组合脚本从外层注入，
	// 而不必给每个平台/格式的脚本都复刻一遍。
	// 默认值：vite build 命令的 mode（不指定时为 production）。
	const effectiveMode = process.env.VETTA_BUILD_ENV || mode;
	const env = loadEnv(effectiveMode, process.cwd(), "VETTA_");

	if (!env.VETTA_SERVER_URL) {
		throw new Error(
			`[vite.main.config] VETTA_SERVER_URL 未配置，请检查 .env.${effectiveMode}（mode=${effectiveMode}）`,
		);
	}
	console.log(`[vite.main.config] mode=${effectiveMode}, VETTA_SERVER_URL=${env.VETTA_SERVER_URL}`);

	// 将 .env.<mode> 中的 VETTA_* 变量内联到构建产物
	const define: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		define[`process.env.${key}`] = JSON.stringify(value);
	}

	return {
		define,
		resolve: {
			alias: {
				x11: resolve(process.cwd(), "src/main/shims/x11.ts"),
			},
		},
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
					// CJS-with-native-loader 包不能被内联进 ESM 主 bundle。它们
					// 内部裸用 __filename / __dirname 定位 .node / .wasm，rollup
					// 不改写这些标识符 —— 一旦运行时走到那段代码就抛
					// `ReferenceError: __filename is not defined`，并被上层 stream
					// catch 当成 errorMessage 暴露在 UI 上（看上去像是模型回了这
					// 段错误文本）。
					//
					// 修法：全部 external，让运行时通过 createRequire 走 Node 真正
					// 的 CJS 加载器（那里 __filename 真实存在）。后续遇到同类报错
					// 的包也加进这个列表。配合 electron-builder 的 asarUnpack 让
					// native .node / .wasm 文件以真实文件形式落地，否则 bindings
					// 走文件系统探测时找不到 addon。
					"@silvia-odwyer/photon-node",
					"dbus-next",
					"usocket",
					"bindings",
					"@mariozechner/clipboard",
				],
			},
			minify: false,
			sourcemap: true,
		},
	};
});
