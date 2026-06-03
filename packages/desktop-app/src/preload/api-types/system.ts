import type { RuntimeStatus, RuntimesStatus, RuntimeType } from "../../main/runtimes/types.js";

export interface DesktopShellApi {
	showInFolder(fullPath: string): Promise<void>;
	showItemInFolder(fullPath: string): Promise<void>;
}

export interface DesktopWindowApi {
	minimize(): Promise<void>;
	maximize(): Promise<void>;
	close(): Promise<void>;
	isMaximized(): Promise<boolean>;
}

export interface DesktopSettingsApi {
	getServerUrl(): Promise<string>;
	getServerToken(): Promise<string | undefined>;
	setServerToken(token: string | undefined): Promise<void>;
	getServerRefreshToken(): Promise<string | undefined>;
	setServerRefreshToken(token: string | undefined): Promise<void>;
}

export interface DesktopCreditsApi {
	getBalance(): Promise<{ balance: number | null; unlimited?: boolean }>;
}

export interface DesktopTrayApi {
	setQuitBehavior(hideToTray: boolean): Promise<void>;
	getQuitBehavior(): Promise<boolean>;
	setTooltip(text: string): Promise<void>;
}

// ─── Permissions (macOS) ───
export type PermissionKind = "full-disk-access" | "accessibility" | "notifications";
export type PermissionStatus = "granted" | "denied" | "unknown";
export interface PermissionsSnapshot {
	fullDiskAccess: PermissionStatus;
	accessibility: PermissionStatus;
	notifications: PermissionStatus;
}
export interface DesktopPermissionsApi {
	checkAll(): Promise<PermissionsSnapshot>;
	openPane(kind: PermissionKind): Promise<void>;
}

/** 托管运行时(环境管理面板)。见 ADR-0011。 */
export interface DesktopRuntimesApi {
	getStatus(): Promise<RuntimesStatus>;
	/** 强制重新获取(内置 vendor 拷贝,失败回退下载)推荐版本。 */
	reinstall(type: RuntimeType): Promise<RuntimeStatus>;
	/** 重新探测系统已装运行时。 */
	redetect(): Promise<RuntimesStatus>;
}
