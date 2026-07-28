/**
 * 与客户端共享的鉴权凭据。
 *
 * 客户端的登录态原本只活在 renderer 的 localStorage 里，MCP server 是独立进程读不到。
 * 故登录时由主进程把 token 落到 `~/.vetta/auth.json`，这里直读——两边共用同一份凭据，
 * 用户登录一次即可，无需为 MCP 单独配置任何东西。
 *
 * 环境变量优先，便于 CI 与本地联调覆盖，也让本模块无需真实登录即可测试。
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** 主进程写入的凭据文件形状（多写的字段一律忽略，避免与主进程强耦合）。 */
export interface VettaCredentials {
	/** 接口基址，如 https://api.vetta.dev */
	baseUrl: string;
	/** 访问令牌，作为 Bearer 使用 */
	token: string;
}

export const CREDENTIALS_FILENAME = "auth.json";

/** 凭据文件路径：`~/.vetta/auth.json`，可用 VETTA_HOME 覆盖根目录。 */
export function credentialsPath(): string {
	const home = process.env.VETTA_HOME?.trim() || join(homedir(), ".vetta");
	return join(home, CREDENTIALS_FILENAME);
}

/**
 * 读取凭据。环境变量 > 凭据文件。
 * 读不到返回 null，由调用方给出「请先在 Vetta 客户端登录」这类可操作的提示，
 * 而不是抛一个 ENOENT 让 agent 无从下手。
 */
export function loadCredentials(): VettaCredentials | null {
	const envToken = process.env.VETTA_API_TOKEN?.trim();
	const envBase = process.env.VETTA_API_BASE_URL?.trim();
	if (envToken && envBase) {
		return { baseUrl: normalizeBaseUrl(envBase), token: envToken };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(credentialsPath(), "utf8"));
	} catch {
		return null;
	}
	if (typeof parsed !== "object" || parsed === null) return null;

	const record = parsed as Record<string, unknown>;
	const token = envToken || (typeof record.token === "string" ? record.token.trim() : "");
	const baseUrl = envBase || (typeof record.baseUrl === "string" ? record.baseUrl.trim() : "");
	if (!token || !baseUrl) return null;

	return { baseUrl: normalizeBaseUrl(baseUrl), token };
}

/**
 * 归一 baseUrl 为**服务根**（不含 API 前缀），拼接一律由 apiUrl 负责。
 *
 * 必须容忍两种写法：desktop 注入的 `VETTA_SERVER_URL` 本身就带 `/api/v1`
 * （见 `packages/desktop-app` 的 .env），而手工设 `VETTA_API_BASE_URL` 的人
 * 通常只写到域名。两者不统一就会拼出 `/api/v1/api/v1/...` 而 404。
 */
export function normalizeBaseUrl(raw: string): string {
	return raw.replace(/\/+$/, "").replace(/\/api\/v\d+$/, "");
}

/** API 前缀。服务端所有业务端点都挂在这个前缀下。 */
export const API_PREFIX = "/api/v1";

/** 由服务根与端点路径拼出完整 URL。 */
export function apiUrl(baseUrl: string, path: string): string {
	return `${normalizeBaseUrl(baseUrl)}${API_PREFIX}${path}`;
}
