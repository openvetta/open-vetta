import { describe, expect, it } from "vitest";
import { validateMcpConfig } from "./mcp-config-validation";

describe("validateMcpConfig managed runtime environment", () => {
	it("accepts known MCP resource ownership scopes and rejects unknown values", () => {
		expect(
			validateMcpConfig({
				mcpServers: {
					shared: { command: "server", resourceScope: "application" },
					rooted: { command: "server", resourceScope: "workspace" },
				},
			}),
		).toMatchObject({
			mcpServers: {
				shared: { resourceScope: "application" },
				rooted: { resourceScope: "workspace" },
			},
		});
		expect(() =>
			validateMcpConfig({ mcpServers: { invalid: { command: "server", resourceScope: "session" } } }),
		).toThrow(/resourceScope/);
	});

	it("accepts string overrides only for a managed HTTP runtime", () => {
		expect(
			validateMcpConfig({
				mcpServers: {
					xiaohongshu: {
						type: "http",
						url: "http://127.0.0.1/mcp",
						managedRuntimeId: "xiaohongshu-runtime",
						managedRuntimeEnv: { XHS_PROXY: "http://127.0.0.1:7890" },
					},
				},
			}),
		).toMatchObject({
			mcpServers: {
				xiaohongshu: { managedRuntimeEnv: { XHS_PROXY: "http://127.0.0.1:7890" } },
			},
		});
	});

	it("rejects runtime environment overrides on an ordinary remote HTTP server", () => {
		expect(() =>
			validateMcpConfig({
				mcpServers: {
					remote: {
						type: "http",
						url: "https://example.com/mcp",
						managedRuntimeEnv: { TOKEN: "secret" },
					},
				},
			}),
		).toThrow(/managedRuntimeEnv/);
	});

	it("accepts sse servers with headers and oauth fields but not managed runtimes", () => {
		expect(
			validateMcpConfig({
				mcpServers: {
					legacy: {
						type: "sse",
						url: "https://legacy.example.com/sse",
						headers: { Authorization: "Bearer x" },
						oauthClientId: "client",
					},
				},
			}).mcpServers.legacy,
		).toMatchObject({ type: "sse", url: "https://legacy.example.com/sse" });
		expect(() => validateMcpConfig({ mcpServers: { legacy: { type: "sse" } } })).toThrow("url");
		expect(() =>
			validateMcpConfig({
				mcpServers: { legacy: { type: "sse", url: "https://x.test/sse", managedRuntimeId: "runtime" } },
			}),
		).toThrow();
		expect(() => validateMcpConfig({ mcpServers: { legacy: { type: "websocket", url: "wss://x.test" } } })).toThrow();
	});
});
