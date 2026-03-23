import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	root: "src/renderer",
	base: "./",
	build: {
		outDir: resolve(process.cwd(), "dist/renderer"),
		emptyOutDir: false,
	},
	server: {
		host: '127.0.0.1',
		port: 5173,
	},
});
