/**
 * 能力操作层：三条安装轨道（skills 目录 / plugins 目录 / mcp.json）的差异只在这里展开。
 * 每个操作统一登记 busy id、刷新数据源，并把结果写进 message / error。
 */
import type { PluginPermission } from "@preload/api";
import { i18n } from "@shared/i18n";
import { abilityToMarketMcpServer, downloadAbility } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { notifyPluginsChanged } from "../../plugins/runtime/plugin-events";
import type { McpSettingsModel } from "../../settings/components/useMcpSettingsModel";
import type { AbilityItem, McpAbility, PluginAbility } from "../types";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/**
 * 一次安装尝试的结果。`needs-setup` 表示只弹出了凭证/授权引导，尚未真正落盘——
 * 套装安装遇到它必须停下，否则会给出「已安装」却什么都没装成。
 */
type InstallOutcome = "installed" | "needs-setup" | "skipped";

export interface AbilityActions {
	busyIds: ReadonlySet<string>;
	message: string | null;
	error: string | null;
	install: (item: AbilityItem) => void;
	uninstall: (item: AbilityItem) => void;
	toggle: (item: AbilityItem) => void;
	setPluginPermission: (item: PluginAbility, permission: PluginPermission, granted: boolean) => void;
	setPluginCommand: (item: PluginAbility, command: string, granted: boolean) => void;
	reloadPlugin: (item: PluginAbility) => void;
	uninstallMembers: (members: AbilityItem[]) => void;
	importSkillArchive: (file: File) => void;
	importing: boolean;
}

export function useAbilityActions({ mcp, refresh }: { mcp: McpSettingsModel; refresh: () => void }): AbilityActions {
	const token = useAtomValue(authTokenAtom);
	const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set<string>());
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);

	const run = useCallback(
		(id: string, operation: () => Promise<string | null>) => {
			setBusyIds((prev) => new Set(prev).add(id));
			setError(null);
			setMessage(null);
			void operation()
				.then((next) => setMessage(next))
				.catch((err: unknown) => setError(errorMessage(err)))
				.finally(() => {
					setBusyIds((prev) => {
						const next = new Set(prev);
						next.delete(id);
						return next;
					});
					refresh();
				});
		},
		[refresh],
	);

	const installSkill = useCallback(
		async (item: AbilityItem): Promise<InstallOutcome> => {
			if (item.type !== "skill" && item.type !== "scene") return "skipped";
			if (!token) throw new Error(i18n.t("abilities:error.notLoggedIn"));
			const buffer = await downloadAbility(token, item.type, item.slug);
			await window.vetta.skills.installFromMarket(item.slug, buffer, item.type, {
				alias: item.title,
				marketDescription: item.description,
				version: item.version,
				sha256: item.sha256,
			});
			return "installed";
		},
		[token],
	);

	const installPlugin = useCallback(
		async (item: PluginAbility): Promise<InstallOutcome> => {
			if (!token) throw new Error(i18n.t("abilities:error.notLoggedIn"));
			const buffer = await downloadAbility(token, "plugin", item.slug);
			await window.vetta.plugins.installFromArchive(buffer, {
				source: "remote",
				expectedSha256: item.sha256,
			});
			notifyPluginsChanged();
			return "installed";
		},
		[token],
	);

	const installMcp = useCallback(
		async (item: McpAbility): Promise<InstallOutcome> => {
			// bundle 的私有内联成员：没有市场行，配置直接来自 bundle 声明
			if (item.inlineConfig) {
				await mcp.onAddRemoteServer({
					id: item.slug,
					name: item.serverName,
					display_name: item.title,
					description: item.description,
					icon: item.icon,
					config: item.inlineConfig,
				});
				return "installed";
			}
			if (item.preset) {
				return mcp.onAddBuiltinServer(item.preset, { abilityVersion: item.market?.version });
			}
			if (item.market) {
				await mcp.onAddRemoteServer(abilityToMarketMcpServer(item.market), { abilityVersion: item.market.version });
				return "installed";
			}
			return "skipped";
		},
		[mcp],
	);

	const installOne = useCallback(
		async (item: AbilityItem): Promise<InstallOutcome> => {
			if (item.type === "plugin") return installPlugin(item);
			if (item.type === "mcp") return installMcp(item);
			if (item.type === "bundle") return "skipped";
			return installSkill(item);
		},
		[installMcp, installPlugin, installSkill],
	);

	const uninstallOne = useCallback(
		async (item: AbilityItem): Promise<string | null> => {
			if (item.type === "plugin") {
				await window.vetta.plugins.uninstall(item.slug);
				notifyPluginsChanged();
			} else if (item.type === "mcp") {
				await mcp.onDeleteServer(item.serverName);
			} else if (item.type === "skill" || item.type === "scene") {
				await window.vetta.skills.uninstall(item.slug, item.type);
			} else {
				return null;
			}
			return i18n.t("abilities:message.uninstalled", { name: item.title });
		},
		[mcp],
	);

	const outcomeMessage = useCallback((outcome: InstallOutcome, name: string): string | null => {
		if (outcome === "installed") return i18n.t("abilities:message.installed", { name });
		if (outcome === "needs-setup") return i18n.t("abilities:message.setupRequired", { name });
		return null;
	}, []);

	const install = useCallback(
		(item: AbilityItem) => {
			if (item.readonly) return;
			if (item.type === "bundle") {
				run(item.id, async () => {
					// 以服务端声明的成员清单为准：解析不到的成员（已下架 / 未上架）必须报错，
					// 不能只遍历 memberItems 后无条件返回「已安装」
					const resolvedById = new Map(item.memberItems.map((member) => [member.id, member]));
					const unavailable: string[] = [];
					for (const member of item.members) {
						const target = resolvedById.get(`${member.type}:${member.slug}`);
						if (!target) {
							unavailable.push(member.name || member.slug);
							continue;
						}
						if (target.readonly || (target.installed && !target.needsUpdate)) continue;
						const outcome = await installOne(target);
						if (outcome === "needs-setup") return outcomeMessage(outcome, target.title);
					}
					if (unavailable.length > 0) {
						throw new Error(i18n.t("abilities:error.membersUnavailable", { names: unavailable.join(", ") }));
					}
					return outcomeMessage("installed", item.title);
				});
				return;
			}
			run(item.id, async () => outcomeMessage(await installOne(item), item.title));
		},
		[installOne, outcomeMessage, run],
	);

	const uninstall = useCallback(
		(item: AbilityItem) => {
			if (item.readonly || item.type === "bundle") return;
			run(item.id, () => uninstallOne(item));
		},
		[run, uninstallOne],
	);

	const uninstallMembers = useCallback(
		(members: AbilityItem[]) => {
			if (members.length === 0) return;
			const first = members[0];
			if (!first) return;
			run(first.id, async () => {
				for (const member of members) {
					await uninstallOne(member);
				}
				return i18n.t("abilities:message.uninstalledCount", { count: members.length });
			});
		},
		[run, uninstallOne],
	);

	const toggleOne = useCallback(
		async (item: AbilityItem): Promise<void> => {
			if (item.type === "plugin") {
				await window.vetta.plugins.setEnabled(item.slug, !item.enabled);
				notifyPluginsChanged();
				return;
			}
			if (item.type === "mcp") {
				await mcp.onToggleDisabled(item.serverName);
				return;
			}
			if (item.type === "skill" || item.type === "scene") {
				await window.vetta.skills.toggle(item.slug);
			}
		},
		[mcp],
	);

	const toggle = useCallback(
		(item: AbilityItem) => {
			if (item.readonly) return;
			if (item.type === "bundle") {
				const targets = item.memberItems.filter((member) => member.installed && member.enabled === item.enabled);
				run(item.id, async () => {
					for (const member of targets) await toggleOne(member);
					return null;
				});
				return;
			}
			run(item.id, async () => {
				await toggleOne(item);
				return null;
			});
		},
		[run, toggleOne],
	);

	const setPluginPermission = useCallback(
		(item: PluginAbility, permission: PluginPermission, granted: boolean) => {
			run(`${item.id}:permission:${permission}`, async () => {
				if (granted) await window.vetta.plugins.grantPermissions(item.slug, [permission]);
				else await window.vetta.plugins.revokePermissions(item.slug, [permission]);
				notifyPluginsChanged();
				return null;
			});
		},
		[run],
	);

	const setPluginCommand = useCallback(
		(item: PluginAbility, command: string, granted: boolean) => {
			run(`${item.id}:command:${command}`, async () => {
				if (granted) await window.vetta.plugins.grantCommands(item.slug, [command]);
				else await window.vetta.plugins.revokeCommands(item.slug, [command]);
				notifyPluginsChanged();
				return null;
			});
		},
		[run],
	);

	const reloadPlugin = useCallback(
		(item: PluginAbility) => {
			run(item.id, async () => {
				const plugin = await window.vetta.plugins.reload(item.slug);
				notifyPluginsChanged();
				return i18n.t("abilities:message.reloaded", { name: plugin.name, version: plugin.activeVersion });
			});
		},
		[run],
	);

	const importSkillArchive = useCallback(
		(file: File) => {
			setImporting(true);
			setError(null);
			setMessage(null);
			void file
				.arrayBuffer()
				.then((buffer) => window.vetta.skills.importCustom(buffer))
				.then((result) => setMessage(i18n.t("abilities:message.imported", { name: result.name })))
				.catch((err: unknown) => setError(errorMessage(err)))
				.finally(() => {
					setImporting(false);
					refresh();
				});
		},
		[refresh],
	);

	return {
		busyIds,
		message,
		error,
		install,
		uninstall,
		toggle,
		setPluginPermission,
		setPluginCommand,
		reloadPlugin,
		uninstallMembers,
		importSkillArchive,
		importing,
	};
}
