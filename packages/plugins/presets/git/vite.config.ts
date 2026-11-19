import tailwindcss from "@tailwindcss/vite";
import { vettaPluginFederation } from "@vetta-org/plugin-vite";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		tailwindcss(),
		vettaPluginFederation({
			name: "git",
			entry: "./src/index.tsx",
			hostUi: true,
			// 设置页复用宿主的 SettingSection / SettingRow，不再自绘设置项卡片。
			hostThemeUi: true,
		}),
	],
	esbuild: {
		jsx: "automatic",
		jsxImportSource: "react",
	},
});
