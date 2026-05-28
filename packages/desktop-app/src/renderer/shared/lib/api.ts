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
let refreshInFlight: Promise<string | null> | null = null;

export async function tryRefreshAccessToken(): Promise<string | null> {
	if (refreshInFlight) return refreshInFlight;
	refreshInFlight = (async (): Promise<string | null> => {
		try {
			const next = await window.vetta.auth.refreshToken();
			return next ?? null;
		} catch {
			return null;
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
		const newAccess = await tryRefreshAccessToken();
		if (newAccess) {
			res = await fetch(base + path, withNewAuth(options, newAccess));
		}
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

export async function fetchCreditsBalance(token: string): Promise<{ balance: number }> {
	return request<{ balance: number }>("/credits/balance", {
		headers: authHeaders(token),
	});
}

export interface CreditTransactionVO {
	id: number;
	user_id: number;
	username: string;
	type: string;
	amount: number;
	balance: number;
	model_id: string;
	provider_name: string;
	input_tokens: number;
	output_tokens: number;
	remark: string;
	created_at: string;
}

export async function fetchCreditTransactions(
	token: string,
	page?: number,
	pageSize?: number,
): Promise<{ list: CreditTransactionVO[]; total: number; page: number; page_size: number }> {
	const params = new URLSearchParams();
	if (page) params.set("page", String(page));
	if (pageSize) params.set("page_size", String(pageSize));
	const qs = params.toString();
	return request(`/credits/transactions${qs ? `?${qs}` : ""}`, {
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
}

export async function fetchMarketSkills(token: string): Promise<MarketSkillInfo[]> {
	return request<MarketSkillInfo[]>("/skills/market", {
		headers: authHeaders(token),
	});
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

// ─── Remote MCP Servers ───

export interface MarketMcpServer {
	id: number;
	name: string;
	display_name: string;
	description: string;
	transport: "http" | "stdio";
	url: string;
	headers: Record<string, string>;
	command: string;
	args: string[];
	env: Record<string, string>;
	auto_approve: string[];
}

export async function fetchMarketMcpServers(token: string): Promise<MarketMcpServer[]> {
	return request<MarketMcpServer[]>("/mcp-servers/market", {
		headers: authHeaders(token),
	});
}

// ─── Flowing ───

export interface FlowingTransferVO {
	id: number;
	flowing_id: number;
	project_name: string;
	sender_id: number;
	sender_name: string;
	sender_avatar: string;
	receiver_id: number;
	receiver_name: string;
	receiver_avatar: string;
	parent_transfer_id: number | null;
	message: string;
	status: string;
	file_list: string[];
	file_storage_key: string;
	stage_index: number | null;
	created_at: string;
	responded_at: string | null;
}

export interface ColleagueInfo {
	id: number;
	username: string;
	avatar: string;
}

export async function fetchColleagues(token: string): Promise<ColleagueInfo[]> {
	return request<ColleagueInfo[]>("/users/colleagues", {
		headers: authHeaders(token),
	});
}

export async function fetchPendingFlowings(token: string): Promise<FlowingTransferVO[]> {
	return request<FlowingTransferVO[]>("/flowing/pending", {
		headers: authHeaders(token),
	});
}

export async function fetchPendingCount(token: string): Promise<number> {
	const data = await request<{ count: number }>("/flowing/pending/count", {
		headers: authHeaders(token),
	});
	return data.count;
}

export async function sendFlowing(
	token: string,
	metadata: {
		project_name: string;
		flowing_id?: number;
		receiver_ids: number[];
		parent_transfer_id?: number;
		message: string;
		file_list: string[];
	},
	file: Blob,
): Promise<FlowingTransferVO[]> {
	const formData = new FormData();
	formData.append("metadata", JSON.stringify(metadata));
	formData.append("file", file, "flowing.zip");

	const base = await getApiBase();
	const res = await fetch(`${base}/flowing/send`, {
		method: "POST",
		headers: authHeaders(token),
		body: formData,
	});
	if (res.status === 401) {
		notifyUnauthorized();
		throw new Error("登录已过期，请重新登录");
	}
	const json = (await res.json()) as ApiResponse<FlowingTransferVO[]>;
	if (json.code !== 0) {
		throw new Error(json.message);
	}
	return json.data as FlowingTransferVO[];
}

export async function respondFlowing(token: string, transferId: number, action: "accept" | "reject"): Promise<void> {
	await request<unknown>(`/flowing/transfer/${transferId}/respond`, {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify({ action }),
	});
}

export async function downloadFlowingFile(token: string, transferId: number): Promise<ArrayBuffer> {
	const base = await getApiBase();
	const res = await fetch(`${base}/flowing/transfer/${transferId}/download`, {
		headers: authHeaders(token),
	});
	if (!res.ok) throw new Error(`下载失败: ${res.status}`);
	return res.arrayBuffer();
}

/** 构造一个带 token query 的流转文件下载 URL，用于直接喂给 <a>/<img>/全局预览 Dialog */
export async function flowingDownloadUrl(token: string, storageKey: string): Promise<string> {
	const base = await getApiBase();
	return `${base}/flowing/download?key=${encodeURIComponent(storageKey)}&token=${encodeURIComponent(token)}`;
}

export async function fetchFlowingHistory(
	token: string,
	flowingId: number,
): Promise<{ flowing: { id: number; project_name: string }; history: FlowingTransferVO[] }> {
	return request(`/flowing/${flowingId}/history`, {
		headers: authHeaders(token),
	});
}

// ─── Workflow ───

export interface WorkflowStage {
	name: string;
	description: string;
	member_ids: number[];
}

export interface WorkflowTemplate {
	id: number;
	name: string;
	description: string;
	org_id: number;
	created_by: number;
	creator_name: string;
	is_active: boolean;
	mode: string;
	stages: WorkflowStage[];
	created_at: string;
	updated_at: string;
}

export interface StageInstance {
	name: string;
	description: string;
	member_ids: number[];
	status: string; // pending / in_progress / completed / returned
	entered_at: string | null;
	completed_at: string | null;
	completed_by: number | null;
	file_list?: string[];
	file_storage_key?: string;
	message?: string;
}

export interface WorkflowInstance {
	id: number;
	workflow_id: number;
	workflow_name: string;
	flowing_id: number;
	current_stage: number;
	status: string; // active / completed / terminated
	started_by: number;
	starter_name: string;
	stages: StageInstance[];
	created_at: string;
	completed_at: string | null;
}

export interface NextStageMembers {
	stage_index: number;
	stage_name: string;
	members: { id: number; username: string; avatar: string }[];
}

export async function fetchAvailableWorkflows(token: string): Promise<WorkflowTemplate[]> {
	return request<WorkflowTemplate[]>("/workflows/available", {
		headers: authHeaders(token),
	});
}

export async function bindWorkflow(
	token: string,
	data: {
		workflow_id: number;
		project_name: string;
		flowing_id?: number;
	},
): Promise<WorkflowInstance> {
	return request<WorkflowInstance>("/workflows/bind", {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify(data),
	});
}

export async function fetchWorkflowInstanceByFlowing(token: string, flowingId: number): Promise<WorkflowInstance> {
	return request<WorkflowInstance>(`/workflows/instance/by-flowing/${flowingId}`, {
		headers: authHeaders(token),
	});
}

export async function uploadFlowingFile(token: string, flowingId: number, file: Blob): Promise<string> {
	const formData = new FormData();
	formData.append("file", file, "flowing.zip");

	const base = await getApiBase();
	const res = await fetch(`${base}/flowing/${flowingId}/upload`, {
		method: "POST",
		headers: authHeaders(token),
		body: formData,
	});
	if (res.status === 401) {
		notifyUnauthorized();
		throw new Error("登录已过期，请重新登录");
	}
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.message ?? `上传失败 (${res.status})`);
	}
	const body = await res.json();
	return body.data.storage_key as string;
}

export async function completeWorkflowStage(
	token: string,
	instanceId: number,
	data?: { storage_key?: string; file_list?: string[]; message?: string },
): Promise<void> {
	await request<void>(`/workflows/instance/${instanceId}/complete-stage`, {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify(data ?? {}),
	});
}

export async function revokeWorkflowComplete(token: string, instanceId: number): Promise<void> {
	await request<void>(`/workflows/instance/${instanceId}/revoke-complete`, {
		method: "POST",
		headers: authHeaders(token),
	});
}

export async function terminateWorkflow(token: string, instanceId: number): Promise<void> {
	await request<void>(`/workflows/instance/${instanceId}/terminate`, {
		method: "POST",
		headers: authHeaders(token),
	});
}

export async function fetchNextStageMembers(token: string, instanceId: number): Promise<NextStageMembers> {
	return request<NextStageMembers>(`/workflows/instance/${instanceId}/next-stage-members`, {
		headers: authHeaders(token),
	});
}

// ─── Flowing Chat ───

export interface ChatAttachment {
	type: "image" | "file";
	storage_key: string;
	name: string;
	size: number;
	mime?: string;
	width?: number;
	height?: number;
}

export interface ChatReplySnapshot {
	sender_id: number;
	sender_name: string;
	type: string;
	preview: string;
	deleted: boolean;
}

export interface ChatSystemEvent {
	event: "flowing_created" | "flowing_closed" | "stage_entered" | "stage_returned";
	stage_index?: number;
	stage_name?: string;
	actor_id?: number;
	actor_name?: string;
}

export interface ChatMessageVO {
	id: number;
	flowing_id: number;
	type: "text" | "image" | "file" | "system";
	content: string;
	sender_id: number;
	sender_name: string;
	sender_avatar: string;
	attachments: ChatAttachment[];
	mentioned_user_ids: number[];
	reply_to_id: number | null;
	reply_to_snapshot?: ChatReplySnapshot | null;
	system_event?: ChatSystemEvent | null;
	created_at: string;
	deleted_at?: string | null;
	deleted_by?: number | null;
}

export interface ChatUnreadVO {
	flowing_id: number;
	project_name: string;
	unread_count: number;
	last_sender_id?: number;
	last_sender?: string;
	last_type?: string;
	last_content?: string;
	last_created_at?: string;
}

export interface ChatMember {
	id: number;
	username: string;
	avatar: string;
}

export async function fetchChatMembers(token: string, flowingId: number): Promise<ChatMember[]> {
	return request<ChatMember[]>(`/flowing/${flowingId}/chat/members`, {
		headers: authHeaders(token),
	});
}

export async function fetchChatMessages(
	token: string,
	flowingId: number,
	opts?: { before?: number; limit?: number },
): Promise<ChatMessageVO[]> {
	const params = new URLSearchParams();
	if (opts?.before) params.set("before", String(opts.before));
	if (opts?.limit) params.set("limit", String(opts.limit));
	const qs = params.toString();
	return request<ChatMessageVO[]>(`/flowing/${flowingId}/chat/messages${qs ? `?${qs}` : ""}`, {
		headers: authHeaders(token),
	});
}

export async function sendChatMessage(
	token: string,
	flowingId: number,
	body: {
		type: "text" | "image" | "file";
		content?: string;
		attachments?: ChatAttachment[];
		mentioned_user_ids?: number[];
		reply_to_id?: number;
	},
): Promise<ChatMessageVO> {
	return request<ChatMessageVO>(`/flowing/${flowingId}/chat/messages`, {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export async function deleteChatMessage(token: string, flowingId: number, msgId: number): Promise<void> {
	await request<unknown>(`/flowing/${flowingId}/chat/messages/${msgId}`, {
		method: "DELETE",
		headers: authHeaders(token),
	});
}

export async function markChatRead(token: string, flowingId: number, lastReadMessageId: number): Promise<void> {
	await request<unknown>(`/flowing/${flowingId}/chat/read`, {
		method: "POST",
		headers: { ...authHeaders(token), "Content-Type": "application/json" },
		body: JSON.stringify({ last_read_message_id: lastReadMessageId }),
	});
}

export async function fetchChatUnreadSummary(token: string): Promise<ChatUnreadVO[]> {
	return request<ChatUnreadVO[]>("/chat/unread/summary", {
		headers: authHeaders(token),
	});
}

export async function uploadChatAttachment(token: string, flowingId: number, file: File): Promise<ChatAttachment> {
	const formData = new FormData();
	formData.append("file", file, file.name);
	const base = await getApiBase();
	const res = await fetch(`${base}/flowing/${flowingId}/chat/upload`, {
		method: "POST",
		headers: authHeaders(token),
		body: formData,
	});
	if (res.status === 401) {
		notifyUnauthorized();
		throw new Error("登录已过期，请重新登录");
	}
	const json = (await res.json()) as ApiResponse<ChatAttachment>;
	if (json.code !== 0) {
		throw new Error(json.message);
	}
	return json.data as ChatAttachment;
}

export async function chatAttachmentUrl(token: string, storageKey: string): Promise<string> {
	const base = await getApiBase();
	return `${base}/chat/attachment?key=${encodeURIComponent(storageKey)}&token=${encodeURIComponent(token)}`;
}
