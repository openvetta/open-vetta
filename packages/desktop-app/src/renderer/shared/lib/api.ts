import type { RefreshOutcome } from "@preload/api";

let cachedBaseUrl: string | undefined;

async function getApiBase(): Promise<string> {
	if (cachedBaseUrl) return cachedBaseUrl;
	cachedBaseUrl = await window.vetta.settings.getServerUrl();
	return cachedBaseUrl;
}

/** Listeners notified when server responds with 401 and refresh fails. */
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
	unauthorizedListeners.add(listener);
	return () => unauthorizedListeners.delete(listener);
}

function notifyUnauthorized(): void {
	for (const listener of unauthorizedListeners) {
		listener();
	}
}

/**
 * Listeners notified after a successful refresh — gives renderer atoms /
 * localStorage / settings.json a single sync point.
 */
type TokenRefreshedListener = (next: { accessToken: string; refreshToken: string }) => void;
const tokenRefreshedListeners = new Set<TokenRefreshedListener>();

export function onTokenRefreshed(listener: TokenRefreshedListener): () => void {
	tokenRefreshedListeners.add(listener);
	return () => tokenRefreshedListeners.delete(listener);
}

function notifyTokenRefreshed(next: { accessToken: string; refreshToken: string }): void {
	for (const listener of tokenRefreshedListeners) {
		listener(next);
	}
}

interface ApiResponse<T> {
	code: number;
	message: string;
	data?: T;
}

const ACCESS_TOKEN_KEY = "vetta-auth-token";
const REFRESH_TOKEN_KEY = "vetta-refresh-token";

function readStoredAccessToken(): string | undefined {
	return localStorage.getItem(ACCESS_TOKEN_KEY) ?? undefined;
}

/**
 * 单飞：并发 401 只触发一次 refresh。
 * 实现：委托主进程做唯一权威 refresh，避免主/渲染两端同时拿同一个
 * refresh_token 调 /auth/refresh 触发服务端 reuse-detection 的 revoked 错误。
 * 主进程成功后会写 settings.json + 广播 `vetta:auth:token-refreshed`，
 * 渲染层的 localStorage / atom 由顶部的广播订阅 + notifyTokenRefreshed 同步。
 */
let refreshInFlight: Promise<RefreshOutcome> | null = null;

export async function tryRefreshAccessToken(): Promise<RefreshOutcome> {
	if (refreshInFlight) return refreshInFlight;
	refreshInFlight = (async (): Promise<RefreshOutcome> => {
		try {
			return await window.vetta.auth.refreshToken();
		} catch {
			// IPC 异常按暂时性处理，不登出。
			return { status: "transient" };
		}
	})();
	try {
		return await refreshInFlight;
	} finally {
		refreshInFlight = null;
	}
}

/**
 * 主进程广播的 refresh 结果：把新 token 也写到 localStorage，并通知 atom 订阅者。
 * 主进程已经写过 settings.json，所以这里不再回写主进程，避免回环。
 */
window.vetta?.auth?.onTokenRefreshed?.((next) => {
	localStorage.setItem(ACCESS_TOKEN_KEY, next.accessToken);
	localStorage.setItem(REFRESH_TOKEN_KEY, next.refreshToken);
	notifyTokenRefreshed(next);
});

/**
 * 若 options.headers 含 Authorization，则用新 token 替换；否则保持原样。
 */
function withNewAuth(options: RequestInit | undefined, accessToken: string): RequestInit | undefined {
	if (!options?.headers) return options;
	const headers = new Headers(options.headers as HeadersInit);
	if (headers.has("Authorization")) {
		headers.set("Authorization", `Bearer ${accessToken}`);
		return { ...options, headers };
	}
	return options;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const base = await getApiBase();
	let res = await fetch(base + path, options);
	if (res.status === 401) {
		// 不要给 /auth/refresh 自身做 refresh-retry，避免死循环
		if (path === "/auth/refresh") {
			notifyUnauthorized();
			throw new Error("登录已过期，请重新登录");
		}
		const outcome = await tryRefreshAccessToken();
		if (outcome.status === "transient") {
			// 暂时性失败（网络/超时/5xx）：不登出，抛普通错误让上层重试/提示。
			throw new Error("网络异常，请稍后重试");
		}
		if (outcome.status === "unauthorized") {
			notifyUnauthorized();
			throw new Error("登录已过期，请重新登录");
		}
		res = await fetch(base + path, withNewAuth(options, outcome.accessToken));
		if (res.status === 401) {
			notifyUnauthorized();
			throw new Error("登录已过期，请重新登录");
		}
	}
	const json = (await res.json()) as ApiResponse<T>;
	if (json.code !== 0) {
		throw new Error(json.message);
	}
	return json.data as T;
}

/**
 * 读取当前最新的 access token（refresh 后会自动更新）。
 * 提供给 SSE / 直接拼 URL（如 flowingDownloadUrl）的场景使用——
 * 这些路径不走 request()，所以无法自动 refresh，至少要能拿到最新值。
 */
export function getCurrentAccessToken(): string | undefined {
	return readStoredAccessToken();
}

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

// ─── Server Info ───

export type DeployMode = "enterprise" | "personal";

export async function fetchServerInfo(): Promise<{ deploy_mode: DeployMode }> {
	return request<{ deploy_mode: DeployMode }>("/info");
}

// ─── Team (personal mode) ───

export interface TeamVO {
	id: number;
	name: string;
	owner_id: number;
	role?: string;
	created_at: string;
}

export interface TeamDetailVO {
	id: number;
	name: string;
	owner_id: number;
	invite_code: string;
	members: TeamMemberVO[];
	created_at: string;
}

export interface TeamMemberVO {
	id: number;
	user_id: number;
	username: string;
	avatar: string;
	role: string;
	created_at: string;
}

export async function fetchMyTeams(token: string): Promise<TeamVO[]> {
	return request<TeamVO[]>("/teams", {
		headers: authHeaders(token),
	});
}

export async function createTeam(token: string, name: string): Promise<TeamVO> {
	return request<TeamVO>("/teams", {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
}

export async function fetchTeamDetail(token: string, teamId: number): Promise<TeamDetailVO> {
	return request<TeamDetailVO>(`/teams/${teamId}`, {
		headers: authHeaders(token),
	});
}

export async function joinTeam(token: string, inviteCode: string): Promise<TeamVO> {
	return request<TeamVO>("/teams/join", {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify({ invite_code: inviteCode }),
	});
}

export async function leaveTeam(token: string, teamId: number): Promise<void> {
	await request<unknown>(`/teams/${teamId}/leave`, {
		method: "POST",
		headers: authHeaders(token),
	});
}

export async function resetTeamInviteCode(token: string, teamId: number): Promise<string> {
	const data = await request<{ invite_code: string }>(`/teams/${teamId}/reset-invite`, {
		method: "POST",
		headers: authHeaders(token),
	});
	return data.invite_code;
}

export async function removeTeamMember(token: string, teamId: number, userId: number): Promise<void> {
	await request<unknown>(`/teams/${teamId}/members/${userId}`, {
		method: "DELETE",
		headers: authHeaders(token),
	});
}

// ─── User ───

export interface UserInfo {
	id: number;
	username: string;
	nickname: string;
	phone?: string;
	email?: string;
	avatar: string;
	is_active: boolean;
	created_at: string;
}

export interface LoginResponse {
	/** deprecated alias，等同于 access_token；保留兼容字段 */
	token: string;
	access_token: string;
	refresh_token: string;
	user: UserInfo;
}

export async function loginByAccount(account: string, password: string): Promise<LoginResponse> {
	return request<LoginResponse>("/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ account, password }),
	});
}

/** 主动注销 refresh token（登出时调用，失败不阻塞本地清理） */
export async function logoutOnServer(refreshToken: string | undefined): Promise<void> {
	if (!refreshToken) return;
	try {
		const base = await getApiBase();
		await fetch(`${base}/auth/logout`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ refresh_token: refreshToken }),
		});
	} catch {
		// 网络失败也不阻断本地登出
	}
}

export async function fetchOAuthProviders(): Promise<string[]> {
	return request<string[]>("/oauth/providers");
}

export async function fetchOAuthURL(provider: string): Promise<string> {
	const data = await request<{ url: string }>(`/oauth/${provider}/url`);
	return data.url;
}

export async function fetchCurrentUser(token: string): Promise<UserInfo> {
	return request<UserInfo>("/users/me", {
		headers: authHeaders(token),
	});
}

export async function updateProfile(
	token: string,
	data: { nickname?: string; email?: string; avatar?: string },
): Promise<UserInfo> {
	return request<UserInfo>("/users/me", {
		method: "PUT",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
}

// ─── Usage series (token activity) ───

export interface UsageSeriesPoint {
	date: string;
	credits: number;
	tokens: number;
	requests: number;
}

export interface UsageSeries {
	points: UsageSeriesPoint[];
	start_time: string;
	end_time: string;
}

export async function fetchUsageSeries(token: string, days: 7 | 30 | 90 | 365 = 30): Promise<UsageSeries> {
	return request<UsageSeries>(`/usage/me/series?days=${days}`, {
		headers: authHeaders(token),
	});
}

// ─── Market Skills ───

export interface MarketSkillInfo {
	name: string;
	alias: string;
	description: string;
	license: string;
	type: "skill" | "scene";
	version: string;
	author: string;
	tags: string[];
	category: string;
	/** 空=默认；solar:xxx-bold；外部 URL；或 /api/v1/skill-icons/:id */
	icon: string;
	/** 归档包 sha256，安装前校验用；归档机制之前上传的存量技能为空 */
	sha256: string;
	download_count: number;
}

export async function fetchMarketSkills(token: string): Promise<MarketSkillInfo[]> {
	const items = await request<MarketSkillInfo[]>("/skills/market", {
		headers: authHeaders(token),
	});
	return Promise.all(
		(items ?? []).map(async (item) => {
			const icon = await resolveMarketIconUrl(item.icon);
			return { ...item, icon: icon ?? "" };
		}),
	);
}

export async function downloadSkill(token: string, name: string): Promise<ArrayBuffer> {
	const serverUrl = await window.vetta.settings.getServerUrl();
	const resp = await fetch(`${serverUrl}/skills/${name}/download`, {
		headers: authHeaders(token),
	});
	if (!resp.ok) throw new Error(`下载失败: ${resp.status}`);
	return resp.arrayBuffer();
}

export async function fetchSkillInfo(token: string, name: string): Promise<MarketSkillInfo> {
	return request<MarketSkillInfo>(`/skills/${name}/info`, {
		headers: authHeaders(token),
	});
}

// ─── Market Plugins ───

export interface MarketPluginInfo {
	plugin_id: string;
	name: string;
	version: string;
	description: string;
	author: string;
	plugin_api_version: string;
	permissions: string[];
	tags: string[];
	/** zip 包 sha256，安装前校验用；摘要机制之前上传的存量插件为空 */
	sha256: string;
	download_count: number;
}

export async function fetchMarketPlugins(token: string): Promise<MarketPluginInfo[]> {
	return request<MarketPluginInfo[]>("/plugins/market", {
		headers: authHeaders(token),
	});
}

export async function downloadPlugin(token: string, id: string): Promise<ArrayBuffer> {
	const serverUrl = await window.vetta.settings.getServerUrl();
	const resp = await fetch(`${serverUrl}/plugins/${id}/download`, {
		headers: authHeaders(token),
	});
	if (!resp.ok) throw new Error(`下载失败: ${resp.status}`);
	return resp.arrayBuffer();
}

export async function fetchPluginInfo(token: string, id: string): Promise<MarketPluginInfo> {
	return request<MarketPluginInfo>(`/plugins/${id}/info`, {
		headers: authHeaders(token),
	});
}

// ─── Remote MCP Servers ───

export interface MarketMcpServer {
	id: number;
	name: string;
	display_name: string;
	description: string;
	/** 图标：外部 URL，或相对路径 `/api/v1/mcp-servers/:id/icon` */
	icon?: string;
	/** 由管理员维护的原样配置，直接作为 mcpServers[name] 写入本地 mcp.json */
	config: Record<string, unknown>;
}

/**
 * 将市场实体 icon 解析为 UI 可用值：
 * - 空 → undefined
 * - `solar:xxx` → 原样（由 theme-ui 按 iconify class 渲染）
 * - 绝对/data URL → 原样
 * - 相对路径 → 拼成绝对 URL（供 <img src>）
 */
export async function resolveMarketIconUrl(icon: string | undefined | null): Promise<string | undefined> {
	if (!icon?.trim()) return undefined;
	const trimmed = icon.trim();
	if (trimmed.startsWith("solar:")) {
		return trimmed;
	}
	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("data:") ||
		trimmed.startsWith("blob:")
	) {
		return trimmed;
	}
	const base = (await getApiBase()).replace(/\/$/, "");
	if (trimmed.startsWith("/")) {
		// base 通常是 https://host/api/v1；相对路径可能是 /api/v1/...
		try {
			const u = new URL(base);
			return `${u.origin}${trimmed}`;
		} catch {
			return `${base}${trimmed}`;
		}
	}
	return `${base}/${trimmed}`;
}

/** @deprecated 使用 resolveMarketIconUrl */
export async function resolveMarketMcpIconUrl(icon: string | undefined | null): Promise<string | undefined> {
	return resolveMarketIconUrl(icon);
}

export async function fetchMarketMcpServers(token: string): Promise<MarketMcpServer[]> {
	const items = await request<MarketMcpServer[]>("/mcp-servers/market", {
		headers: authHeaders(token),
	});
	// 并行解析图标绝对地址（上传图标多为 /api/v1/mcp-servers/:id/icon）
	return Promise.all(
		(items ?? []).map(async (item) => {
			const icon = await resolveMarketMcpIconUrl(item.icon);
			return { ...item, icon: icon || undefined };
		}),
	);
}

// ─── Notifications (站内信, ADR-0018) ───

export interface NotificationVO {
	id: number;
	type: string;
	title: string;
	body: string;
	payload?: unknown;
	read: boolean;
	created_at: string;
}

export async function fetchNotifications(
	token: string,
	params?: { page?: number; page_size?: number },
): Promise<{ list: NotificationVO[]; total: number; page: number; page_size: number }> {
	const qs = new URLSearchParams();
	if (params?.page) qs.set("page", String(params.page));
	if (params?.page_size) qs.set("page_size", String(params.page_size));
	const suffix = qs.toString() ? `?${qs.toString()}` : "";
	return request<{ list: NotificationVO[]; total: number; page: number; page_size: number }>(
		`/notifications${suffix}`,
		{ headers: authHeaders(token) },
	);
}

export async function fetchNotificationUnread(token: string): Promise<number> {
	const data = await request<{ unread: number }>("/notifications/unread-count", {
		headers: authHeaders(token),
	});
	return data.unread;
}

export async function markNotificationRead(token: string, id: number): Promise<void> {
	await request<unknown>(`/notifications/${id}/read`, {
		method: "POST",
		headers: authHeaders(token),
	});
}

export async function markAllNotificationsRead(token: string): Promise<void> {
	await request<unknown>("/notifications/read-all", {
		method: "POST",
		headers: authHeaders(token),
	});
}

export async function deleteNotification(token: string, id: number): Promise<void> {
	await request<unknown>(`/notifications/${id}`, {
		method: "DELETE",
		headers: authHeaders(token),
	});
}

export async function clearReadNotifications(token: string): Promise<void> {
	await request<unknown>("/notifications/clear-read", {
		method: "POST",
		headers: authHeaders(token),
	});
}
