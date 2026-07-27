/**
 * 宿主自带的内置 MCP server。
 *
 * 与「用户装的 MCP」的区别是意图而非机制：内置服务是产品的一部分，
 * 用户既不需要配置它，也不该在能力市场里看到它——所以它不写 mcp.json、
 * 不作为可安装条目出现，只在运行时注入（见 McpManager 的 builtinServers）。
 *
 * 目前只有一个：vetta 自身的能力上传服务。它让 agent 能把做好的
 * skill / plugin / mcp / bundle 直接提交到能力市场。
 */

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import type { McpStdioServerConfig } from "./types.js";

/**
 * 内置 vetta server 的运行时名。
 * 不能含下划线——工具适配器按 `mcp_${serverName}_${toolName}` 命名并按第一个 `_` 切分。
 */
export const VETTA_BUILTIN_MCP_NAME = "vetta";

/**
 * 解析 `@vetta/vetta-mcp` 的 stdio 入口。
 *
 * 用 createRequire 而非硬编码相对路径：打包后 coding-agent 从 dist 加载，
 * 相对路径会随打包布局漂移，而包解析始终跟着 node_modules 走。
 * 解析不到就返回 null——内置服务缺失只该少一组工具，不该让整个 MCP 初始化失败。
 */
export function resolveVettaMcpEntry(): string | null {
	try {
		const require = createRequire(import.meta.url);
		const entry = require.resolve("@vetta/vetta-mcp/bin");
		return existsSync(entry) ? entry : null;
	} catch {
		return null;
	}
}

/**
 * 组装内置 server 集合。返回空对象表示这次没有可用的内置服务。
 *
 * @param entry 覆盖入口路径（测试与打包场景用），省略时自动解析
 */
export function buildBuiltinMcpServers(entry?: string | null): Record<string, McpStdioServerConfig> {
	const resolved = entry === undefined ? resolveVettaMcpEntry() : entry;
	if (!resolved) return {};

	return {
		[VETTA_BUILTIN_MCP_NAME]: {
			command: process.execPath,
			args: [resolved],
			// 子进程继承父进程环境即可：凭据由 ~/.vetta/auth.json 提供，不经环境变量传递，
			// 免得 token 出现在进程列表里。
		},
	};
}
