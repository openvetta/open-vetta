import { describe, expect, it } from "vitest";
import { buildBuiltinMcpServers, VETTA_BUILTIN_MCP_NAME } from "../src/core/mcp/builtin-mcp.js";

describe("buildBuiltinMcpServers", () => {
	it("按给定入口组装 stdio 配置", () => {
		const servers = buildBuiltinMcpServers("/opt/vetta/vetta-mcp/dist/bin.js");
		const config = servers[VETTA_BUILTIN_MCP_NAME];

		expect(config).toBeDefined();
		expect(config.command).toBe(process.execPath);
		expect(config.args).toEqual(["/opt/vetta/vetta-mcp/dist/bin.js"]);
	});

	it("入口解析不到时返回空集合而不是抛错", () => {
		// 内置服务缺失只该少一组工具，不该让整个 MCP 初始化失败
		expect(buildBuiltinMcpServers(null)).toEqual({});
	});

	it("运行时名不含下划线", () => {
		// 工具适配器按 mcp_${server}_${tool} 命名并按第一个 _ 切分，
		// server 名里出现下划线会把工具名切错
		expect(VETTA_BUILTIN_MCP_NAME).not.toContain("_");
	});

	it("不通过环境变量传递凭据", () => {
		const config = buildBuiltinMcpServers("/x/bin.js")[VETTA_BUILTIN_MCP_NAME];
		// 凭据走 ~/.vetta/auth.json，避免 token 出现在进程列表里
		expect(config.env).toBeUndefined();
	});
});
