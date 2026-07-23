import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@shared": resolve(__dirname, "./src/renderer/shared"),
			"@domains": resolve(__dirname, "./src/renderer/domains"),
		},
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
