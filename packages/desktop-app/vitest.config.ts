import { resolve } from "node:path";
import { coverageConfigDefaults, defineConfig } from "vitest/config";

const codingAgentSrc = resolve(__dirname, "../coding-agent/src");

export default defineConfig({
	resolve: {
		alias: [
			{ find: "@shared", replacement: resolve(__dirname, "./src/renderer/shared") },
			{ find: "@domains", replacement: resolve(__dirname, "./src/renderer/domains") },
			{ find: "@vetta/ai", replacement: resolve(__dirname, "../ai/src/index.ts") },
			{ find: "@vetta/agent-core", replacement: resolve(__dirname, "../agent/src/index.ts") },
			{
				find: "@vetta/coding-agent/runtime-host/greenfield",
				replacement: resolve(__dirname, "../coding-agent/src/adapters/runtime-core/greenfield.ts"),
			},
			{
				find: "@vetta/coding-agent/runtime-host",
				replacement: resolve(__dirname, "../coding-agent/src/adapters/runtime-core/index.ts"),
			},
			{
				find: "@vetta/coding-agent/host",
				replacement: resolve(__dirname, "../coding-agent/src/adapters/runtime-tools/index.ts"),
			},
			{ find: /^@vetta\/coding-agent\/(.+)\.js$/, replacement: `${codingAgentSrc}/$1.ts` },
			{ find: "@vetta/coding-agent", replacement: resolve(__dirname, "../coding-agent/src/index.ts") },
			{
				find: "@vetta/runtime-core/kernel",
				replacement: resolve(__dirname, "../runtime-core/src/kernel/index.ts"),
			},
			{
				find: "@vetta/runtime-core/conversation",
				replacement: resolve(__dirname, "../runtime-core/src/conversation/index.ts"),
			},
			{
				find: "@vetta/runtime-core/sandbox",
				replacement: resolve(__dirname, "../runtime-core/src/sandbox/index.ts"),
			},
			{ find: "@vetta/runtime-core", replacement: resolve(__dirname, "../runtime-core/src/index.ts") },
			{ find: "@vetta/runtime-mcp", replacement: resolve(__dirname, "../runtime-mcp/src/index.ts") },
			{
				find: "@vetta/runtime-storage/conversation",
				replacement: resolve(__dirname, "../runtime-storage/src/conversation/index.ts"),
			},
			{
				find: "@vetta/runtime-subagents",
				replacement: resolve(__dirname, "../runtime-subagents/src/index.ts"),
			},
			{
				find: "@vetta/runtime-tools/coding",
				replacement: resolve(__dirname, "../runtime-tools/src/coding/index.ts"),
			},
		],
	},
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		// Opt-in via `bun run test:coverage` only; default `test` is unchanged.
		// Full src denominator is intentional — low totals reflect thin unit coverage,
		// not a trimmed include list. UI still relies on verify:ui:*, not V8.
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			reportOnFailure: true,
			// Honest full-src denominator; low totals reflect thin unit coverage.
			include: ["src/**/*.{ts,tsx}"],
			exclude: [...coverageConfigDefaults.exclude],
		},
	},
});
