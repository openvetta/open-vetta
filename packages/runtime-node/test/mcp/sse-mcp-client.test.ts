import { createServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpClient, HttpMcpClient, type McpHttpServerConfig } from "../../src/mcp/index.js";
import { createMcpSdkTransport } from "../../src/mcp/transports/http/sdk-session-adapter.js";

const initializeParams = {
	protocolVersion: "2024-11-05",
	clientInfo: { name: "test-client", version: "1.0.0" },
	capabilities: {},
};

/** 旧式 HTTP+SSE 服务器：GET /sse 开事件流，客户端把 JSON-RPC 请求 POST 到它下发的 /messages 端点。 */
async function startLegacySseServer(options: { requireToken?: string } = {}) {
	const transports = new Map<string, SSEServerTransport>();
	const seenAuthorization: Array<string | undefined> = [];
	const http: HttpServer = createServer((request, response) => {
		void handle(request, response);
	});
	async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
		const url = new URL(request.url ?? "/", "http://127.0.0.1");
		seenAuthorization.push(request.headers.authorization);
		if (options.requireToken && request.headers.authorization !== `Bearer ${options.requireToken}`) {
			response.writeHead(401).end("unauthorized");
			return;
		}
		if (request.method === "GET" && url.pathname === "/sse") {
			const transport = new SSEServerTransport("/messages", response);
			transports.set(transport.sessionId, transport);
			response.on("close", () => transports.delete(transport.sessionId));
			const server = new Server({ name: "legacy-sse-server", version: "9.9.9" }, { capabilities: { tools: {} } });
			server.setRequestHandler(ListToolsRequestSchema, async () => ({
				tools: [{ name: "echo", inputSchema: { type: "object", properties: { text: { type: "string" } } } }],
			}));
			server.setRequestHandler(CallToolRequestSchema, async (call) => ({
				content: [{ type: "text", text: `echo:${String(call.params.arguments?.text)}` }],
			}));
			await server.connect(transport);
			return;
		}
		if (request.method === "POST" && url.pathname === "/messages") {
			const transport = transports.get(url.searchParams.get("sessionId") ?? "");
			if (!transport) {
				response.writeHead(404).end();
				return;
			}
			await transport.handlePostMessage(request, response);
			return;
		}
		response.writeHead(404).end();
	}
	await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
	const { port } = http.address() as AddressInfo;
	return {
		url: `http://127.0.0.1:${port}/sse`,
		seenAuthorization,
		close: () =>
			new Promise<void>((resolve) => {
				for (const transport of transports.values()) void transport.close();
				http.closeAllConnections();
				http.close(() => resolve());
			}),
	};
}

describe("SSE MCP client", () => {
	const cleanup: Array<() => Promise<void>> = [];

	afterEach(async () => {
		await Promise.all(cleanup.splice(0).map((close) => close()));
	});

	it("connects to a legacy HTTP+SSE server, lists tools and calls one through the same client handle", async () => {
		const server = await startLegacySseServer();
		cleanup.push(server.close);
		const client = createMcpClient("legacy", { type: "sse", url: server.url });
		cleanup.push(() => client.close());

		const initialized = await client.initialize(initializeParams);
		const tools = await client.listTools();
		const result = await client.callTool("echo", { text: "hi" });

		expect(initialized.serverInfo.name).toBe("legacy-sse-server");
		expect(tools.tools.map((tool) => tool.name)).toEqual(["echo"]);
		expect(result.content).toEqual([{ type: "text", text: "echo:hi" }]);
	});

	it("sends configured headers on both the event stream and the message posts", async () => {
		const server = await startLegacySseServer({ requireToken: "secret" });
		cleanup.push(server.close);
		const client = new HttpMcpClient({
			name: "legacy",
			config: { type: "sse", url: server.url, headers: { Authorization: "Bearer secret" } },
		});
		cleanup.push(() => client.close());

		await client.initialize(initializeParams);
		await client.callTool("echo", { text: "x" });

		// GET /sse 与随后的 POST /messages 都带了同一个令牌，没有一条被拒。
		expect(server.seenAuthorization.length).toBeGreaterThanOrEqual(3);
		expect(server.seenAuthorization.every((value) => value === "Bearer secret")).toBe(true);
	});

	it("reports an auth-required error when the SSE endpoint answers 401", async () => {
		const server = await startLegacySseServer({ requireToken: "secret" });
		cleanup.push(server.close);
		const client = new HttpMcpClient({ name: "legacy", config: { type: "sse", url: server.url } });
		cleanup.push(() => client.close());

		await expect(client.initialize(initializeParams)).rejects.toMatchObject({ name: "McpAuthRequiredError" });
	});

	it("does not send an SSE server through the stateless modern protocol", async () => {
		const client = new HttpMcpClient({
			name: "legacy",
			config: { type: "sse", url: "http://127.0.0.1:1/sse", protocolMode: "modern" },
		});

		await expect(client.initialize(initializeParams)).rejects.toThrow('only supports protocolMode "legacy"');
	});

	it("keeps Streamable HTTP as the default transport", () => {
		const url = new URL("http://127.0.0.1:1/mcp");

		expect(createMcpSdkTransport("streamable-http", url, {}).constructor.name).toBe("StreamableHTTPClientTransport");
		expect(createMcpSdkTransport("sse", url, {}).constructor.name).toBe("SSEClientTransport");
		const config: McpHttpServerConfig = { type: "http", url: "http://127.0.0.1:1/mcp" };
		expect(createMcpClient("remote", config)).toBeInstanceOf(HttpMcpClient);
	});
});
