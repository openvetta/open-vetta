import type { PluginOfficialApi } from "@vetta-org/plugin-sdk";
import { assertOfficialModelKeyExists } from "./plugin-official-models";

export function createOfficialImApi(assertOfficial: () => void): PluginOfficialApi["im"] {
	return {
		getStatus: async () => {
			assertOfficial();
			const [config, runtime] = await Promise.all([window.vetta.im.getConfig(), window.vetta.im.getStatus()]);
			return {
				enabled: config.enabled,
				transport: config.transport,
				agentModel: config.agentModel ?? null,
				wechatBound: config.wechat.bound,
				feishuAppId: config.feishu.appId || null,
				runtime,
			};
		},
		getLogs: async (limit = 50) => {
			assertOfficial();
			const logs = await window.vetta.im.getRecentLogs();
			return logs.slice(-limit).map((log) => ({
				level: log.level,
				msg: log.msg,
				time: log.time,
				fields: log.fields,
			}));
		},
		setEnabled: async (enabled) => {
			assertOfficial();
			const result = await window.vetta.im.setConfig({ enabled });
			if (!result.ok) throw new Error(result.error ?? "Failed to update IM config");
			return { status: await window.vetta.im.getStatus() };
		},
		restart: async () => {
			assertOfficial();
			await window.vetta.im.restart();
			return { status: await window.vetta.im.getStatus() };
		},
		setAgentModel: async (modelKey, reasoningLevel) => {
			assertOfficial();
			const config = await window.vetta.im.getConfig();
			const agentModel =
				modelKey === null
					? null
					: (() => {
							const slash = modelKey.indexOf("/");
							return {
								provider: modelKey.slice(0, slash),
								model: modelKey.slice(slash + 1),
								...(reasoningLevel ? { reasoningLevel } : {}),
							};
						})();
			const result = await window.vetta.im.setConfig({ enabled: config.enabled, agentModel });
			if (!result.ok) throw new Error(result.error ?? "Failed to set IM agent model");
			return { status: await window.vetta.im.getStatus() };
		},
		assertModelKeyExists: async (modelKey) => {
			assertOfficial();
			await assertOfficialModelKeyExists(modelKey, "set-agent-model");
		},
	};
}
