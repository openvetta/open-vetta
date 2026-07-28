import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 把 server 当作真正的子进程拉起来，走 stdin/stdout 的 JSON-RPC。
 *
 * 前面的 server.test.ts 用 in-memory 传输验证协议语义，这里验证的是**部署形态**：
 * bin.js 能不能被 node 直接执行、stdout 有没有被日志污染。宿主正是这样拉起它的，
 * 只要有人往 stdout 打一行调试信息，这条测试就会挂。
 */

const ENTRY = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

/** 一次性把若干 JSON-RPC 请求写进子进程，收集其 stdout 上的响应 */
async function roundtrip(requests: unknown[]): Promise<{ responses: Record<string, unknown>[]; stderr: string }> {
	const child = spawn(process.execPath, [ENTRY], {
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, VETTA_HOME: "/nonexistent-vetta-home" },
	});

	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});

	for (const request of requests) {
		child.stdin.write(`${JSON.stringify(request)}\n`);
	}

	// 收满预期条数或超时即收工
	await new Promise<void>((resolve) => {
		const deadline = setTimeout(resolve, 4000);
		const check = setInterval(() => {
			if (stdout.split("\n").filter(Boolean).length >= requests.length) {
				clearInterval(check);
				clearTimeout(deadline);
				resolve();
			}
		}, 25);
	});
	child.kill();

	const responses = stdout
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as Record<string, unknown>);
	return { responses, stderr };
}

describe("stdio 部署形态", () => {
	it("dist/bin.js 已构建", () => {
		expect(existsSync(ENTRY)).toBe(true);
	});

	it("能以子进程方式完成握手并列出工具", async () => {
		const { responses } = await roundtrip([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "smoke", version: "1.0.0" },
				},
			},
			{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
		]);

		const initialize = responses.find((r) => r.id === 1);
		const list = responses.find((r) => r.id === 2);

		expect((initialize?.result as { serverInfo: { name: string } }).serverInfo.name).toBe("vetta");
		const tools = (list?.result as { tools: { name: string }[] }).tools;
		expect(tools.map((t) => t.name).sort()).toEqual(["list_my_abilities", "upload_ability"]);
	});

	it("stdout 只有 JSON-RPC，没有被日志污染", async () => {
		const { responses } = await roundtrip([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s", version: "1" } },
			},
		]);
		// 每一行都能解析成 JSON-RPC，说明 stdout 没混入其它输出
		for (const response of responses) {
			expect(response.jsonrpc).toBe("2.0");
		}
	});

	it("无凭据时报未登录而不是崩溃", async () => {
		const { responses } = await roundtrip([
			{
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "s", version: "1" } },
			},
			{
				jsonrpc: "2.0",
				id: 2,
				method: "tools/call",
				params: { name: "upload_ability", arguments: { type: "plugin", detail: {} } },
			},
		]);

		const call = responses.find((r) => r.id === 2);
		const result = call?.result as { isError: boolean; content: { text: string }[] };
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("未找到 Vetta 登录凭据");
	});
});
