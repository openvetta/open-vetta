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
