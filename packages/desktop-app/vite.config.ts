import path, { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const themeDevelopmentEnabled = process.env.VETTA_THEME_DEV_SERVER === "1";

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

export default defineConfig({
	plugins: [react(), tailwindcss(), ...(themeDevelopmentEnabled ? [themeDevelopmentReload()] : [])],
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
		}
	},
	build: {
		outDir: resolve(process.cwd(), "dist/renderer"),
		emptyOutDir: false,
		rollupOptions: {
			input: {
				main: resolve(__dirname, "src/renderer/index.html"),
				pet: resolve(__dirname, "src/renderer/pet.html"),
				quickpanel: resolve(__dirname, "src/renderer/quickpanel.html"),
			},
		},
	},
	server: {
		host: '127.0.0.1',
		port: 3000,
	},
});
