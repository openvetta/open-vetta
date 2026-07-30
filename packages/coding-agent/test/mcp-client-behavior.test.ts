import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { McpClient } from "../src/core/mcp/mcp-client.js";
import { McpProcess } from "../src/core/mcp/mcp-process.js";
import type { McpInitializeParams } from "../src/core/mcp/types.js";

const fixturePath = fileURLToPath(new URL("./fixtures/mcp-stdio-server.mjs", import.meta.url));
const initializeParams: McpInitializeParams = {
	protocolVersion: "2024-11-05",
	clientInfo: { name: "test-client", version: "1.0.0" },
	capabilities: {},
};

describe("MCP stdio client behavior", () => {
	const clients: McpClient[] = [];

	afterEach(async () => {
		await Promise.all(clients.splice(0).map((client) => client.close()));
	});

	it("maps initialize, tool, resource and prompt requests over the real stdio process", async () => {
		const client = createClient();

		expect(McpClient.name).toBe("McpClient");
		expect(McpProcess.name).toBe("McpProcess");
		await expect(client.initialize(initializeParams)).resolves.toMatchObject({
			protocolVersion: "2024-11-05",
			serverInfo: { name: "fixture", version: "1.0.0" },
		});
		expect(client.isClientInitialized()).toBe(true);
		expect(client.getPid()).toEqual(expect.any(Number));
		await expect(client.listTools()).resolves.toMatchObject({ nextCursor: "tools-next" });
		await expect(client.listTools("tools-next")).resolves.toMatchObject({ tools: [{ name: "echo" }] });
		await expect(client.callTool("echo", { value: "hello" })).resolves.toEqual({
			content: [{ type: "text", text: '{"value":"hello"}' }],
		});
		await expect(client.listResources()).resolves.toMatchObject({ resources: [{ uri: "fixture://resource" }] });
		await expect(client.readResource("fixture://resource")).resolves.toEqual({
			contents: [{ type: "text", text: "fixture://resource" }],
		});
		await expect(client.listPrompts()).resolves.toMatchObject({ prompts: [{ name: "fixture-prompt" }] });
	});

	it("preserves remote JSON-RPC error code and data", async () => {
		const client = createClient();
		await client.initialize(initializeParams);

		await expect(client.callTool("error")).rejects.toMatchObject({
			message: "fixture failure",
			code: -32001,
			data: { reason: "expected" },
		});
	});

	it("rejects a request with the method-specific timeout error", async () => {
		const client = createClient(500);
		await client.initialize(initializeParams);

		await expect(client.callTool("timeout")).rejects.toThrow("Request timeout: tools/call");
	});

	it("rejects pending requests when the server process exits", async () => {
		const client = createClient();
		await client.initialize(initializeParams);

		await expect(client.callTool("exit")).rejects.toThrow("MCP server exited: code=7, signal=null");
		expect(client.isClientInitialized()).toBe(false);
	});

	function createClient(timeout = 2000): McpClient {
		const client = new McpClient({
			name: "fixture",
			config: { command: process.execPath, args: [fixturePath] },
			timeout,
		});
		clients.push(client);
		return client;
	}
});
