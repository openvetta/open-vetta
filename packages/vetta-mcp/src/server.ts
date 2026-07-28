/**
 * Vetta 内置 MCP server。
 *
 * 走 SDK 的**低阶** Server 而非 McpServer：低阶接口直接吃 JSON Schema，
 * 免去引入 zod 及其与 SDK 之间的版本漂移风险，而工具 schema 本来就要以
 * JSON Schema 形式上线，多一层 zod 转换没有收益。
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadCredentials, type VettaCredentials } from "./credentials.js";
import { listMyAbilities } from "./list-abilities.js";
import {
	LIST_MY_ABILITIES_DESCRIPTION,
	LIST_MY_ABILITIES_SCHEMA,
	UPLOAD_ABILITY_DESCRIPTION,
	UPLOAD_ABILITY_SCHEMA,
} from "./tool-schemas.js";
import type { UploadAbilityInput } from "./types.js";
import { type UploadAbilityDeps, uploadAbility } from "./upload-ability.js";

export const SERVER_NAME = "vetta";
export const SERVER_VERSION = "0.0.1";

export interface CreateServerOptions {
	/** 凭据读取器，默认读环境变量与 ~/.vetta/auth.json */
	loadCredentials?: () => VettaCredentials | null;
	/** 透传给 upload 的依赖注入点，便于测试 */
	deps?: UploadAbilityDeps;
}

/** 未登录时的统一提示。凭据缺失是最常见的失败，报错必须可操作。 */
const NOT_LOGGED_IN =
	"未找到 Vetta 登录凭据。请先在 Vetta 客户端登录；若在客户端之外使用，可设置环境变量 VETTA_API_BASE_URL 与 VETTA_API_TOKEN。";

/** 工具结果统一包成 MCP 的 content 形状，结构化数据以 JSON 文本回传。 */
function toolResult(payload: unknown, isError = false) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
		isError,
	};
}

export function createVettaMcpServer(options: CreateServerOptions = {}): Server {
	const readCredentials = options.loadCredentials ?? loadCredentials;

	const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			{
				name: "upload_ability",
				description: UPLOAD_ABILITY_DESCRIPTION,
				inputSchema: UPLOAD_ABILITY_SCHEMA,
			},
			{
				name: "list_my_abilities",
				description: LIST_MY_ABILITIES_DESCRIPTION,
				inputSchema: LIST_MY_ABILITIES_SCHEMA,
			},
		],
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const credentials = readCredentials();
		if (!credentials) {
			return toolResult({ ok: false, message: NOT_LOGGED_IN }, true);
		}

		switch (request.params.name) {
			case "upload_ability": {
				const input = (request.params.arguments ?? {}) as unknown as UploadAbilityInput;
				const result = await uploadAbility(input, credentials, options.deps);
				return toolResult(result, !result.ok);
			}
			case "list_my_abilities": {
				const result = await listMyAbilities(credentials, options.deps);
				return toolResult(result, !result.ok);
			}
			default:
				return toolResult({ ok: false, message: `未知工具：${request.params.name}` }, true);
		}
	});

	return server;
}
