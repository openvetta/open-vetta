import { type PluginContext, useActiveConversation, useTranslation } from "@vetta-org/plugin-sdk";
import { SessionTopItem, type SessionTopMenuItem } from "@vetta-org/ui";
import { type JSX, useEffect, useMemo, useState } from "react";
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

export function OpenInApp(): JSX.Element | null {
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

	const menuItems = useMemo<SessionTopMenuItem[]>(() => {
		if (!supported || !installed || !cwd) return [];
		const open = async (app: ExternalApp): Promise<void> => {
			try {
				const result = await commandApi?.run("open", buildOpenArgs(app, cwd), { timeoutMs: 10_000 });
				if (result && result.exitCode !== 0) throw new Error(result.stderr || `open exited with ${result.exitCode}`);
			} catch (error) {
				notifyApi?.({ message: t("error.failed", { app: t(app.labelKey) }), variant: "error", error });
			}
		};
		return EXTERNAL_APPS.filter((app) => installed.has(app.id)).map((app, index) => ({
			id: app.id,
			label: t(app.labelKey),
			icon: <span className={`${app.icon} size-4`} />,
			onSelect: () => void open(app),
			separatorBefore: index > 0 && app.id === "terminal",
		}));
	}, [cwd, installed, supported, t]);

	// 不适用（非 macOS / 远程项目 / 还没探测完 / 一个都没有）时返回 null：宿主会连同间距一起收起。
	if (menuItems.length === 0) return null;

	return (
		<SessionTopItem
			title={t("action.title")}
			aria-label={t("action.title")}
			icon={<span className="icon-[solar--square-arrow-right-up-linear] size-4" />}
			menuItems={menuItems}
		/>
	);
}
