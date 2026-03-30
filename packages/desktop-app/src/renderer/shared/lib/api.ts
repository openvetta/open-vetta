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
