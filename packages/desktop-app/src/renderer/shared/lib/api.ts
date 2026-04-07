let cachedBaseUrl: string | undefined;

async function getApiBase(): Promise<string> {
	if (cachedBaseUrl) return cachedBaseUrl;
	cachedBaseUrl = await window.vetta.settings.getServerUrl();
	return cachedBaseUrl;
}

/** Listeners notified when server responds with 401 */
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

interface ApiResponse<T> {
	code: number;
	message: string;
	data?: T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const base = await getApiBase();
	const res = await fetch(base + path, options);
	if (res.status === 401) {
		notifyUnauthorized();
		throw new Error("登录已过期，请重新登录");
	}
	const json = (await res.json()) as ApiResponse<T>;
	if (json.code !== 0) {
		throw new Error(json.message);
	}
	return json.data as T;
}

function authHeaders(token: string): HeadersInit {
	return { Authorization: `Bearer ${token}` };
}

export interface UserInfo {
	id: number;
	username: string;
	phone?: string;
	email?: string;
	avatar: string;
	is_active: boolean;
	created_at: string;
}

export async function loginByAccount(account: string, password: string): Promise<{ token: string; user: UserInfo }> {
	return request<{ token: string; user: UserInfo }>("/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ account, password }),
	});
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

// ─── Market Skills ───

export interface MarketSkillInfo {
	name: string;
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
