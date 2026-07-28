#!/usr/bin/env node
/**
 * stdio 入口。宿主以子进程方式拉起本文件，经 stdin/stdout 走 MCP 协议。
 *
 * 注意 stdout 被协议独占：任何调试输出都必须走 stderr，否则会污染 JSON-RPC 流
 * 导致宿主解析失败。
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createVettaMcpServer } from "./server.js";

async function main(): Promise<void> {
	const server = createVettaMcpServer();
	await server.connect(new StdioServerTransport());
}

main().catch((error) => {
	console.error("[vetta-mcp] 启动失败:", error);
	process.exit(1);
});
