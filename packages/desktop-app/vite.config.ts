import path, { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	root: "src/renderer",
	base: "./",
	resolve: {
		alias: {
			"@shared": path.resolve(__dirname, "./src/renderer/shared"),
			"@domains": path.resolve(__dirname, "./src/renderer/domains"),
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
			},
		},
	},
	server: {
		host: '127.0.0.1',
		port: 3000,
	},
});
