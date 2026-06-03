export interface DesktopAuthApi {
	openExternal(url: string): Promise<void>;
	/**
	 * 委托主进程用磁盘上的 refresh_token 换新 access。返回新 access token 或 null。
	 * 渲染层不要再直接调 /auth/refresh —— 跨进程同时用同一 refresh_token 会被服务端
	 * 视作 reuse 并 revoke，造成"老是掉登录"的体感问题。
	 */
	refreshToken(): Promise<string | null>;
	onOAuthCallback(handler: (data: { token: string; refreshToken?: string }) => void): () => void;
	/**
	 * 主进程发起的请求（如 fetchRemoteProviders / credits balance）收到 401 时触发。
	 * 渲染层应在这里执行登出，但不要中断正在运行的本地模型会话。
	 */
	onUnauthorized(handler: () => void): () => void;
	/** 主进程通过 refresh token 拿到新 access+refresh 后广播给渲染层。 */
	onTokenRefreshed(handler: (data: { accessToken: string; refreshToken: string }) => void): () => void;
}
