import path, { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

function themeDevelopmentReload(): Plugin {
	const themeSourceDir = resolve(__dirname, "../themes/builtin/xianxia/src");
	return {
		name: "vetta-theme-development-reload",
		configureServer(server) {
			const reloadRenderer = (file: string): void => {
				const relativePath = path.relative(themeSourceDir, file);
				if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return;
				server.ws.send({ type: "full-reload" });
			};
			server.watcher.add(themeSourceDir);
			server.watcher.on("add", reloadRenderer);
			server.watcher.on("change", reloadRenderer);
			server.watcher.on("unlink", reloadRenderer);
			server.httpServer?.once("close", () => {
				server.watcher.off("add", reloadRenderer);
				server.watcher.off("change", reloadRenderer);
				server.watcher.off("unlink", reloadRenderer);
			});
		},
	};
}

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "VETTA_");
	const themeDevelopmentEnabled =
		(process.env.VETTA_THEME_DEV_SERVER ?? env.VETTA_THEME_DEV_SERVER) === "1";
	const rawDevServerPort = process.env.VETTA_DESKTOP_DEV_PORT ?? env.VETTA_DESKTOP_DEV_PORT ?? "3020";
	const devServerPort = Number(rawDevServerPort);
	if (!Number.isInteger(devServerPort) || devServerPort < 1 || devServerPort > 65_535) {
		throw new Error(`Invalid VETTA_DESKTOP_DEV_PORT: ${rawDevServerPort}`);
	}
	// 外观「界面主题」区段：默认隐藏；VETTA_SHOW_UI_THEME=true 时展示（shell > .env）
	const showUiTheme = process.env.VETTA_SHOW_UI_THEME ?? env.VETTA_SHOW_UI_THEME ?? "";

	return {
		define: {
			"process.env.VETTA_SHOW_UI_THEME": JSON.stringify(showUiTheme),
		},
		plugins: [
			react(),
			tailwindcss(),
			...(themeDevelopmentEnabled ? [themeDevelopmentReload()] : []),
		],
		root: "src/renderer",
		base: "./",
		resolve: {
			alias: {
				"@shared": path.resolve(__dirname, "./src/renderer/shared"),
				"@domains": path.resolve(__dirname, "./src/renderer/domains"),
				"@vetta/theme-sdk": path.resolve(__dirname, "../theme-sdk/src"),
				"@vetta/theme-ui": path.resolve(__dirname, "../theme-ui/src"),
				"@vetta/ui": path.resolve(__dirname, "../ui/src/index.ts"),
				"@": path.resolve(__dirname, "./src"),
			},
		},
		build: {
			outDir: resolve(process.cwd(), "dist/renderer"),
			emptyOutDir: false,
			sourcemap: false,
			rollupOptions: {
				input: {
					main: resolve(__dirname, "src/renderer/index.html"),
					pet: resolve(__dirname, "src/renderer/pet.html"),
					quickpanel: resolve(__dirname, "src/renderer/quickpanel.html"),
					onboarding: resolve(__dirname, "src/renderer/onboarding.html"),
				},
			},
		},
		server: {
			// Keep off 3000 (packages/site Next) and 3010 (xianxia theme dev).
			host: "127.0.0.1",
			port: devServerPort,
			strictPort: true,
		},
	};
});
