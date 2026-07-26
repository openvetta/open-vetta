import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@vetta\/coding-agent\/adapters\/runtime-tools\/command-executor\.js$/,
				replacement: fileURLToPath(
					new URL("../coding-agent/src/adapters/runtime-tools/command-executor.ts", import.meta.url),
				),
			},
			{
				find: /^@vetta\/coding-agent\/adapters\/runtime-tools\/executable-resolver\.js$/,
				replacement: fileURLToPath(
				new URL("../coding-agent/src/adapters/runtime-tools/executable-resolver.ts", import.meta.url),
				),
			},
			{
				find: "@vetta/coding-agent",
				replacement: fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url)),
			},
			{
				find: "@vetta/coding-agent/",
				replacement: fileURLToPath(new URL("../coding-agent/src/", import.meta.url)),
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
