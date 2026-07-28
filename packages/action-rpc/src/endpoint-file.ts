import { homedir } from "node:os";
import { join } from "node:path";

export const ACTION_RPC_ENDPOINT_FILE_ENV = "VETTA_ACTION_RPC_ENDPOINT_FILE";
export const VETTA_HOME_ENV = "VETTA_HOME";
export const VETTA_CONFIG_DIR_ENV = "VETTA_CONFIG_DIR";

/**
 * 默认配置目录名（即品牌名）。这是整个仓库配置目录的唯一来源——
 * 既用于用户主目录根（~/<name>），也用于项目内目录（projectDir/<name>）。
 * 改品牌只改这一处；按环境隔离（如 dev）则用 VETTA_CONFIG_DIR 覆盖。
 */
export const DEFAULT_CONFIG_DIR_NAME = ".vetta";

function expandTilde(p: string): string {
	if (p === "~") return homedir();
	if (p.startsWith("~/")) return join(homedir(), p.slice(2));
	return p;
}

/**
 * 配置目录名。VETTA_CONFIG_DIR 覆盖，否则用默认品牌名。
 * 用户主目录根与项目内目录都从它派生，保证两者始终一致。
 */
export function getVettaConfigDirName(): string {
	return process.env[VETTA_CONFIG_DIR_ENV] || DEFAULT_CONFIG_DIR_NAME;
}

/**
 * 用户主目录下的数据根。VETTA_HOME（绝对路径，支持 ~ 展开）作为逃生口优先，
 * 否则为 ~/<configDirName>。
 */
export function getVettaHomePath(): string {
	const explicit = process.env[VETTA_HOME_ENV];
	if (explicit) return expandTilde(explicit);
	return join(homedir(), getVettaConfigDirName());
}

export function getActionRpcEndpointFilePath(): string {
	const envPath = process.env[ACTION_RPC_ENDPOINT_FILE_ENV];
	if (envPath) return envPath;
	return join(getVettaHomePath(), "action-server.json");
}
