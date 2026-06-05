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

/** 套餐配额窗口：5 小时 / 周 / 月三档。 */
export interface SubscriptionWindow {
	kind: "5h" | "week" | "month";
	limit: number;
	consumed: number;
	/** RFC3339 时间字符串，窗口重置时刻。 */
	reset_at: string;
}

/** GET /subscription/me 的业务数据（已 unwrap data）。 */
export interface SubscriptionStatus {
	active: boolean;
	zen_enabled: boolean;
	go_enabled: boolean;
	tier_id?: string;
	tier_name?: string;
	badge_text?: string;
	badge_color?: string;
	description?: string;
	/** RFC3339 到期时间。 */
	expires_at?: string;
	windows?: SubscriptionWindow[];
}

export interface DesktopSubscriptionApi {
	/** 拉取当前用户的套餐状态。失败返回 status:null + error。 */
	getStatus(): Promise<{ status: SubscriptionStatus | null; error?: string }>;
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
