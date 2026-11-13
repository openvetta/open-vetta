/** 一个可以接手项目目录的 macOS 应用。 */
export interface ExternalApp {
	readonly id: string;
	/** 语料 key（`app.<id>`）。 */
	readonly labelKey: string;
	/** `open -a` 用的应用名；Finder 直接 `open <dir>`，所以留空。 */
	readonly appName?: string;
	/** Iconify 类名（`icon-[solar--…]`）。 */
	readonly icon: string;
	/** 始终可用，不做安装检测（Finder 随系统）。 */
	readonly alwaysAvailable?: boolean;
}

export const EXTERNAL_APPS: readonly ExternalApp[] = [
	{ id: "finder", labelKey: "app.finder", icon: "icon-[solar--folder-open-linear]", alwaysAvailable: true },
	{ id: "vscode", labelKey: "app.vscode", appName: "Visual Studio Code", icon: "icon-[solar--code-square-linear]" },
	{ id: "cursor", labelKey: "app.cursor", appName: "Cursor", icon: "icon-[solar--code-square-linear]" },
	{ id: "zed", labelKey: "app.zed", appName: "Zed", icon: "icon-[solar--code-square-linear]" },
	{ id: "xcode", labelKey: "app.xcode", appName: "Xcode", icon: "icon-[solar--code-square-linear]" },
	{ id: "terminal", labelKey: "app.terminal", appName: "Terminal", icon: "icon-[solar--programming-linear]" },
];

/** `open` 的参数：Finder 打开目录本身，其余用 `-a` 指定应用。 */
export function buildOpenArgs(app: ExternalApp, cwd: string): string[] {
	return app.appName ? ["-a", app.appName, cwd] : [cwd];
}

/** `open -Ra <应用>`：只查 LaunchServices 里有没有这个应用，不会真的启动它。 */
export function buildProbeArgs(app: ExternalApp): string[] {
	return ["-Ra", app.appName ?? ""];
}

/** 这个插件只对本地 macOS 项目有意义；SSH 远程项目的目录不在本机。 */
export function isOpenableCwd(cwd: string | null | undefined): cwd is string {
	return typeof cwd === "string" && cwd.length > 0 && !cwd.startsWith("ssh://");
}

export function isMacPlatform(platform: string): boolean {
	return /mac/i.test(platform);
}
