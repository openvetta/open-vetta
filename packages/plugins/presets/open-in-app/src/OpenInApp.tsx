import {
	type PluginContext,
	type PluginHeaderActionMenuItem,
	type PluginHeaderActionState,
	useActiveConversation,
	useTranslation,
} from "@vetta-org/plugin-sdk";
import { useEffect, useMemo, useState } from "react";
import { buildOpenArgs, buildProbeArgs, EXTERNAL_APPS, type ExternalApp, isMacPlatform, isOpenableCwd } from "./apps";

type CommandApi = PluginContext["command"];
type NotifyApi = PluginContext["ui"]["notify"];

let commandApi: CommandApi | undefined;
let notifyApi: NotifyApi | undefined;
let installedApps: Promise<ReadonlySet<string>> | undefined;

export function setHostApis(command: CommandApi | undefined, notify: NotifyApi | undefined): void {
	commandApi = command;
	notifyApi = notify;
	installedApps = undefined;
}

/**
 * 只释放自己那一次激活登记的接口。
 * 宿主热重载/重试时，新一次激活可能先于旧一次的 deactivate 完成；无条件清空会把新接口一并抹掉，按钮就永远是空的。
 */
export function releaseHostApis(command: CommandApi | undefined): void {
	if (commandApi !== command) return;
	setHostApis(undefined, undefined);
}

/** 探测一次并缓存：安装状态在一次运行里基本不变，菜单每次展开都重测只会白白起子进程。 */
function detectInstalledApps(): Promise<ReadonlySet<string>> {
	installedApps ??= (async () => {
		const found = new Set<string>();
		const command = commandApi;
		if (!command) return found;
		await Promise.all(
			EXTERNAL_APPS.map(async (app) => {
				if (app.alwaysAvailable) {
					found.add(app.id);
					return;
				}
				try {
					const result = await command.run("open", buildProbeArgs(app), { timeoutMs: 5000 });
					if (result.exitCode === 0) found.add(app.id);
				} catch {
					// 探测失败按「没装」处理，菜单里不出现即可。
				}
			}),
		);
		return found;
	})();
	return installedApps;
}

/**
 * 顶栏动作的声明 hook（`registerHeaderAction({ useAction })`）：返回 `null` 表示此刻不适用
 * （非 macOS / 远程项目 / 没有目录 / 还没探测完 / 一个都没装），宿主不显示也不占位。
 */
export function useOpenInAppAction(): PluginHeaderActionState | null {
	const { t } = useTranslation();
	const { cwd } = useActiveConversation();
	const [installed, setInstalled] = useState<ReadonlySet<string> | null>(null);
	const supported = isMacPlatform(navigator.platform) && isOpenableCwd(cwd);

	useEffect(() => {
		if (!supported) return;
		let cancelled = false;
		void detectInstalledApps().then((found) => {
			if (!cancelled) setInstalled(found);
		});
		return () => {
			cancelled = true;
		};
	}, [supported]);

	return useMemo(() => {
		if (!supported || !installed || !cwd) return null;
		const open = async (app: ExternalApp): Promise<void> => {
			try {
				const result = await commandApi?.run("open", buildOpenArgs(app, cwd), { timeoutMs: 10_000 });
				if (result && result.exitCode !== 0) throw new Error(result.stderr || `open exited with ${result.exitCode}`);
			} catch (error) {
				notifyApi?.({ message: t("error.failed", { app: t(app.labelKey) }), variant: "error", error });
			}
		};
		const menuItems: PluginHeaderActionMenuItem[] = EXTERNAL_APPS.filter((app) => installed.has(app.id)).map(
			(app, index) => ({
				id: app.id,
				label: t(app.labelKey),
				icon: <span className={`${app.icon} size-4`} />,
				onSelect: () => void open(app),
				separatorBefore: index > 0 && app.id === "terminal",
			}),
		);
		if (menuItems.length === 0) return null;
		return {
			title: t("action.title"),
			icon: <span className="icon-[solar--square-arrow-right-up-linear]" />,
			menuItems,
		};
	}, [cwd, installed, supported, t]);
}
