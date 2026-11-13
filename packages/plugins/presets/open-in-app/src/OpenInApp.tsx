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
/** 一次探测的结果：哪些装了，以及它们各自的图标（PNG data URL）。 */
interface DetectedApps {
	readonly installed: ReadonlySet<string>;
	readonly icons: ReadonlyMap<string, string>;
}

let detectedApps: Promise<DetectedApps> | undefined;

export function setHostApis(command: CommandApi | undefined, notify: NotifyApi | undefined): void {
	commandApi = command;
	notifyApi = notify;
	detectedApps = undefined;
}

/**
 * 只释放自己那一次激活登记的接口。
 * 宿主热重载/重试时，新一次激活可能先于旧一次的 deactivate 完成；无条件清空会把新接口一并抹掉，按钮就永远是空的。
 */
export function releaseHostApis(command: CommandApi | undefined): void {
	if (commandApi !== command) return;
	setHostApis(undefined, undefined);
}

/** 探测一次并缓存：安装状态与图标在一次运行里基本不变，菜单每次展开都重测只会白白起子进程。 */
function detectApps(): Promise<DetectedApps> {
	detectedApps ??= (async () => {
		const installed = new Set<string>();
		const icons = new Map<string, string>();
		const command = commandApi;
		if (!command) return { installed, icons };
		await Promise.all(
			EXTERNAL_APPS.map(async (app) => {
				if (app.alwaysAvailable) {
					installed.add(app.id);
				} else {
					try {
						const result = await command.run("open", buildProbeArgs(app), { timeoutMs: 5000 });
						if (result.exitCode === 0) installed.add(app.id);
					} catch {
						// 探测失败按「没装」处理：菜单里这一项置灰。
					}
				}
				try {
					const icon = await command.appIcon(app.iconAppName);
					if (icon) icons.set(app.id, icon);
				} catch {
					// 拿不到图标就用通用图标，不影响使用。
				}
			}),
		);
		return { installed, icons };
	})();
	return detectedApps;
}

/**
 * 顶栏动作的声明 hook（`registerHeaderAction({ useAction })`）：返回 `null` 表示此刻不适用
 * （非 macOS / 远程项目 / 没有目录 / 还没探测完），宿主不显示也不占位。
 * 菜单里始终列出全部应用，没装的置灰、不可点；图标用应用自己的。
 */
export function useOpenInAppAction(): PluginHeaderActionState | null {
	const { t } = useTranslation();
	const { cwd } = useActiveConversation();
	const [detected, setDetected] = useState<DetectedApps | null>(null);
	const supported = isMacPlatform(navigator.platform) && isOpenableCwd(cwd);

	useEffect(() => {
		if (!supported) return;
		let cancelled = false;
		void detectApps().then((found) => {
			if (!cancelled) setDetected(found);
		});
		return () => {
			cancelled = true;
		};
	}, [supported]);

	return useMemo(() => {
		if (!supported || !detected || !cwd) return null;
		const open = async (app: ExternalApp): Promise<void> => {
			try {
				const result = await commandApi?.run("open", buildOpenArgs(app, cwd), { timeoutMs: 10_000 });
				if (result && result.exitCode !== 0) throw new Error(result.stderr || `open exited with ${result.exitCode}`);
			} catch (error) {
				notifyApi?.({ message: t("error.failed", { app: t(app.labelKey) }), variant: "error", error });
			}
		};
		const menuItems: PluginHeaderActionMenuItem[] = EXTERNAL_APPS.map((app, index) => {
			const installed = detected.installed.has(app.id);
			const icon = detected.icons.get(app.id);
			return {
				id: app.id,
				label: t(app.labelKey),
				// 优先用应用自己的图标；没装的变灰，连同文字一起不可点。
				icon: icon ? (
					<img src={icon} alt="" className={installed ? "size-4" : "size-4 opacity-50 grayscale"} draggable={false} />
				) : (
					<span className={`${app.icon} size-4`} />
				),
				onSelect: () => void open(app),
				disabled: !installed,
				separatorBefore: index > 0 && app.id === "terminal",
			};
		});
		return {
			title: t("action.title"),
			icon: <span className="icon-[solar--square-arrow-right-up-linear]" />,
			menuItems,
		};
	}, [cwd, detected, supported, t]);
}
