import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@vetta/agent-core": fileURLToPath(new URL("../agent/src/index.ts", import.meta.url)),
			"@vetta/coding-agent/extensions": fileURLToPath(
				new URL("../coding-agent/src/public-api/extensions.ts", import.meta.url),
			),
			"@vetta/coding-agent/host-services": fileURLToPath(
				new URL("../coding-agent/src/public-api/host-services.ts", import.meta.url),
			),
			"@vetta/coding-agent/runtime-host": fileURLToPath(
				new URL("../coding-agent/src/adapters/runtime-core/index.ts", import.meta.url),
			),
			"@vetta/coding-agent": fileURLToPath(new URL("../coding-agent/src/index.ts", import.meta.url)),
			"@vetta/runtime-core/conversation": fileURLToPath(
				new URL("./src/conversation/index.ts", import.meta.url),
			),
			"@vetta/runtime-core/kernel": fileURLToPath(new URL("./src/kernel/index.ts", import.meta.url)),
			"@vetta/runtime-core/sandbox": fileURLToPath(new URL("./src/sandbox/index.ts", import.meta.url)),
			"@vetta/runtime-core": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
		},
	},
	test: {
		environment: "node",
	},
});
