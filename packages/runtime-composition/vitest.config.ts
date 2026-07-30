import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: "@vetta/coding-agent/composition",
				replacement: fileURLToPath(new URL("../coding-agent/src/composition/index.ts", import.meta.url)),
			},
		],
	},
	test: {
		environment: "node",
	},
});
