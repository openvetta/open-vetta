const API_BASE = "http://localhost:8080/api/v1";

interface ApiResponse<T> {
	code: number;
	message: string;
	data?: T;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
	const res = await fetch(API_BASE + path, options);
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
