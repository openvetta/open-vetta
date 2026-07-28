import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VettaCredentials } from "../src/credentials.js";
import { createVettaMcpServer, SERVER_NAME } from "../src/server.js";
import type { UploadAbilityDeps } from "../src/upload-ability.js";

const credentials: VettaCredentials = { baseUrl: "https://api.example.com", token: "tok" };

/**
 * 拉起一对 in-memory 传输的 client/server，走真实的 MCP 握手与 JSON-RPC。
 * 这验证的是协议层本身能不能通，而不只是内部函数能不能调。
 */
async function connect(options: { credentials?: VettaCredentials | null; deps?: UploadAbilityDeps }): Promise<Client> {
	const server = createVettaMcpServer({
		loadCredentials: () => options.credentials ?? null,
		deps: options.deps,
	});
	const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
	return client;
}

/** 解析工具返回的 JSON 文本负载 */
function payloadOf(result: { content?: unknown }): Record<string, unknown> {
	const content = result.content as { type: string; text: string }[];
	return JSON.parse(content[0].text);
}

function okFetch(payload: unknown) {
	return vi.fn(
		async () =>
			new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } }),
	) as unknown as typeof globalThis.fetch;
}

describe("vetta MCP server", () => {
	let client: Client;

	beforeEach(async () => {
		client = await connect({ credentials, deps: { fetch: okFetch({ code: 0, data: {} }) } });
	});

	it("握手后能列出工具", async () => {
		const { tools } = await client.listTools();
		const names = tools.map((t) => t.name).sort();
		expect(names).toEqual(["list_my_abilities", "upload_ability"]);
	});

	it("upload_ability 的 schema 声明了必填项，agent 才知道要给什么", async () => {
		const { tools } = await client.listTools();
		const upload = tools.find((t) => t.name === "upload_ability");

		expect(upload?.inputSchema.required).toEqual(["type", "detail"]);
		const props = upload?.inputSchema.properties as Record<string, { enum?: string[]; required?: string[] }>;
		expect(props.type.enum).toEqual(["skill", "scene", "mcp", "plugin", "bundle"]);
		expect(props.detail.required).toEqual(["name", "description", "author", "content"]);
		// 说明文案要把各形态差异讲清，否则 agent 只能靠试
		expect(upload?.description).toContain("package_path");
		expect(upload?.description).toContain("mcp_config");
		expect(upload?.description).toContain("members");
	});

	it("入参不合规时经协议回一个 isError 结果而非抛异常", async () => {
		const result = await client.callTool({
			name: "upload_ability",
			arguments: { type: "plugin", detail: {} },
		});

		expect(result.isError).toBe(true);
		const payload = payloadOf(result);
		expect(payload.ok).toBe(false);
		expect(String(payload.message)).toContain("detail.name 必填");
	});

	it("完整入参能走通一次提交", async () => {
		const fetchImpl = okFetch({
			code: 0,
			data: { slug: "demo", type: "plugin", version: "1.0.0", review_status: "pending" },
		});
		const c = await connect({
			credentials,
			deps: { fetch: fetchImpl, readFile: () => Buffer.from("zip"), fileExists: () => true },
		});

		const result = await c.callTool({
			name: "upload_ability",
			arguments: {
				type: "plugin",
				package_path: "/tmp/demo.zip",
				detail: { name: "演示", description: "简介", author: "作者", content: "# 正文" },
			},
		});

		expect(result.isError).toBe(false);
		const payload = payloadOf(result);
		expect(payload.ok).toBe(true);
		expect(payload.slug).toBe("demo");
		expect(fetchImpl).toHaveBeenCalledOnce();
	});

	it("未登录时给出可操作提示且不发请求", async () => {
		const fetchImpl = okFetch({ code: 0, data: {} });
		const c = await connect({ credentials: null, deps: { fetch: fetchImpl } });

		const result = await c.callTool({ name: "upload_ability", arguments: { type: "plugin", detail: {} } });

		expect(result.isError).toBe(true);
		expect(String(payloadOf(result).message)).toContain("请先在 Vetta 客户端登录");
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("list_my_abilities 回报审核进度", async () => {
		const c = await connect({
			credentials,
			deps: {
				fetch: okFetch({
					code: 0,
					data: [
						{
							slug: "demo",
							type: "plugin",
							name: "演示",
							version: "1.0.0",
							review_status: "rejected",
							review_note: "简介太短",
							is_enabled: true,
						},
					],
				}),
			},
		});

		const result = await c.callTool({ name: "list_my_abilities", arguments: {} });
		const payload = payloadOf(result) as { abilities: Record<string, unknown>[] };

		expect(payload.abilities).toHaveLength(1);
		expect(payload.abilities[0].review_status).toBe("rejected");
		expect(payload.abilities[0].review_note).toBe("简介太短");
	});

	it("未知工具不会让 server 崩掉", async () => {
		const result = await client.callTool({ name: "nope", arguments: {} });
		expect(result.isError).toBe(true);
		expect(String(payloadOf(result).message)).toContain("未知工具");
	});

	it("server 以 vetta 之名注册（工具会暴露成 mcp_vetta_*）", () => {
		expect(SERVER_NAME).toBe("vetta");
		// 工具适配器按第一个 _ 切分 server 名，名字里不能有下划线
		expect(SERVER_NAME).not.toContain("_");
	});
});
