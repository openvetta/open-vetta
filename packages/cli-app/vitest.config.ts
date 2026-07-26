import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const codingAgentSrc = fileURLToPath(new URL("../coding-agent/src", import.meta.url));

export default defineConfig({
	resolve: {
		alias: [
			// Stable public host surface (package exports "./host")
			{
				find: "@vetta/coding-agent/host",
				replacement: fileURLToPath(new URL("../coding-agent/src/adapters/runtime-tools/index.ts", import.meta.url)),
			},
			// Deep imports use ESM ".js" suffix; map to monorepo TypeScript sources
			{
				find: /^@vetta\/coding-agent\/(.+)\.js$/,
				replacement: `${codingAgentSrc}/$1.ts`,
			},
			{
				find: "@vetta/coding-agent",
				replacement: fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url)),
			},
			{
				find: "@vetta/runtime-core/kernel",
				replacement: fileURLToPath(new URL("../runtime-core/src/kernel/index.ts", import.meta.url)),
			},
			{
				find: "@vetta/runtime-tools/coding",
				replacement: fileURLToPath(new URL("../runtime-tools/src/coding/index.ts", import.meta.url)),
			},
		],
	},
	test: {
		environment: "node",
	},
});
