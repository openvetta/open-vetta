import { federation } from "@module-federation/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [
		tailwindcss(),
		federation({
			name: "theme_xianxia",
			filename: "remoteEntry.js",
			exposes: {
				"./theme": "./src/index.ts",
			},
			manifest: {
				fileName: "mf-manifest.json",
			},
			publicPath: "auto",
			dts: false,
			shared: {
				"@vetta/theme-sdk": { singleton: true, import: false, requiredVersion: "*" },
				"@vetta/theme-ui": { singleton: true, import: false, requiredVersion: "*" },
				"@vetta/ui": { singleton: true, import: false, requiredVersion: "*" },
				react: { singleton: true, import: false, requiredVersion: "*" },
				"react-dom": { singleton: true, import: false, requiredVersion: "*" },
			},
		}),
	],
	server: {
		host: "127.0.0.1",
		origin: "http://127.0.0.1:3010",
		port: 3010,
		strictPort: true,
	},
	build: {
		assetsDir: "assets",
		rollupOptions: {
			input: "./src/index.ts",
			output: {
				assetFileNames(assetInfo) {
					return assetInfo.names.some((name) => name.endsWith(".css"))
						? "style.css"
						: "assets/[name]-[hash][extname]";
				},
			},
		},
	},
});
