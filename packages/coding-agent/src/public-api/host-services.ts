/**
 * Coding Agent 的宿主侧状态服务适配器。
 *
 * Greenfield Runtime 只通过窄 Port 消费这些资源；Desktop Composition Root
 * 可以在进程边界创建并持有具体实现。
 */
import { AuthStorage } from "../core/auth-storage.js";
import { createCodingAgentHostFromSessionFactory } from "../host/coding-agent-host.js";
import { createCodingAgentSessionFromPublicOptions } from "../host/coding-agent-sdk-host-adapter.js";
import { type CodingAgentModelRuntime, createCodingAgentModelRuntime } from "../models/index.js";
import { SettingsRuntime } from "../settings/index.js";
import type { CodingAgentHost, CodingAgentHostSessionDefaults } from "./sdk/index.js";

export { AuthStorage, createCodingAgentModelRuntime, SettingsRuntime };
export type { CodingAgentModelRuntime };

export interface CreateCodingAgentHostWithServicesOptions {
	readonly authStorage?: AuthStorage;
	readonly modelRuntime?: CodingAgentModelRuntime;
	readonly settings?: SettingsRuntime;
	readonly sessionDefaults?: CodingAgentHostSessionDefaults;
}

/**
 * 将现有宿主状态服务适配到稳定 Host；传入的服务由调用方持有，关闭 Host 不会销毁这些共享对象。
 */
export function createCodingAgentHostWithServices(
	options: CreateCodingAgentHostWithServicesOptions = {},
): CodingAgentHost {
	return createCodingAgentHostFromSessionFactory(
		{ sessionDefaults: options.sessionDefaults },
		(sessionOptions, lifecycle) =>
			createCodingAgentSessionFromPublicOptions(sessionOptions, {
				authStorage: options.authStorage,
				modelRegistry: options.modelRuntime,
				settingsManager: options.settings,
				onSessionClosed: lifecycle.onClosed,
			}),
	);
}
