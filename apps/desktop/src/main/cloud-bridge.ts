/**
 * 宿主侧云服务挂载点（主进程）——**已下线形态**（ADR-0156）。
 *
 * Vetta 服务端不再提供，`main/cloud` 实现随之删除。这里保留消费方需要的
 * 类型与不可用回执：`getCloudBridge()` 恒为 null，宿主功能一律走「无云端」
 * 降级路径。宿主代码只准 import 本文件。
 */

export interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

export interface VettaGatewayRequest {
	path: string;
	method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	body?: unknown;
	timeoutMs?: number;
}

export interface VettaGatewayResponse<T = unknown> {
	ok: boolean;
	status: number;
	code: number;
	message: string;
	data?: T;
}

/** refresh 的三态结果；服务端下线后只有 `unauthorized` 一态可达。 */
export type CloudRefreshOutcome =
	| { status: "ok"; accessToken: string }
	| { status: "unauthorized" }
	| { status: "transient" };

export interface CloudBridge {
	/** 云端 provider 目录（远程模型）。 */
	fetchRemoteProviders(): Promise<RemoteProvidersResult>;
	/** 经服务端的带鉴权中转（图像生成等增值能力）。 */
	requestGateway<T = unknown>(request: VettaGatewayRequest, signal?: AbortSignal): Promise<VettaGatewayResponse<T>>;
	/** 主进程内部 token refresh（单飞）。 */
	tryRefreshAccessToken(): Promise<CloudRefreshOutcome>;
}

/** 无云服务的构建返回 null；调用方必须自带降级路径。 */
export function getCloudBridge(): CloudBridge | null {
	return null;
}

/** 云服务不可用时的统一网关失败回执（envelope 形状，调用方按 !ok 处理）。 */
export function gatewayUnavailableResponse<T = unknown>(): VettaGatewayResponse<T> {
	return { ok: false, status: 0, code: -1, message: "Vetta cloud services are not available in this build" };
}
