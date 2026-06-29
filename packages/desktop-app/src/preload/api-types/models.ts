export interface ModelsConfigData {
	/** Default model identifier: "provider/modelId" */
	defaultModel?: string;
	/** 全局模型("provider/modelId")：周边任务(autotitle/输入预测等)专用；未设置则周边功能失效。 */
	peripheralModel?: string;
	providers: Record<
		string,
		{
			baseUrl?: string;
			apiKey?: string;
			api?: string;
			headers?: Record<string, string>;
			authHeader?: boolean;
			/** 供应商显示名(如 "DeepSeek"),用于 UI 分组标题等;无则回退到 provider 标识 key。 */
			displayName?: string;
			/** 来源标记。"template" = 由[[预设模板]]采纳而来,会被启动时的在线合并覆写;无标记 = 手搓自定义,任何同步逻辑都不得触碰。 */
			source?: "template";
			/** 对应服务端模板的 provider 标识(= 模板 provider key),仅 source==="template" 时存在。 */
			templateId?: string;
			/** 供应商图标 symbol(见 CONTEXT.md「icon symbol」),客户端按此解析内置图标。可选。 */
			icon?: string;
			models?: Array<{
				id: string;
				name?: string;
				api?: string;
				reasoning?: boolean;
				input?: string[];
				contextWindow?: number;
				maxTokens?: number;
				/** 价格($/百万 tokens):input=输入未命中, cacheRead=输入命中, output=输出, cacheWrite=缓存写入。 */
				cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
			}>;
			modelOverrides?: Record<string, Record<string, unknown>>;
		}
	>;
}

export interface RemoteProvidersResult {
	providers: Record<string, unknown>;
	error?: string;
}

/** 单个[[预设模板]]供应商:服务端下发的目录条目,不含 key。 */
export interface ProviderTemplate {
	/** 模板标识(= provider key),持久化时写入 templateId。 */
	id: string;
	displayName: string;
	api: string;
	baseUrl?: string;
	/** 供应商图标 symbol,可选。 */
	icon?: string;
	models: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		input?: string[];
		contextWindow?: number;
		maxTokens?: number;
		cost?: { input: number; output: number; cacheRead: number; cacheWrite: number };
	}>;
}

export interface ProviderTemplatesResult {
	templates: ProviderTemplate[];
	error?: string;
}

export interface DesktopModelsApi {
	get(): Promise<ModelsConfigData>;
	set(config: ModelsConfigData): Promise<void>;
	fetchRemote(): Promise<RemoteProvidersResult>;
	/** 拉取服务端[[预设模板]]目录(公开免登录),并就地在线合并已采纳条目的元数据。 */
	fetchTemplates(): Promise<ProviderTemplatesResult>;
	/** 探测某 (provider, model) 的 baseUrl 是否可达(本地 models.json 优先,回退云端目录)。仅判可达性,任何 HTTP 响应都算通。 */
	probe(ref: { provider: string; model: string }): Promise<{ ok: boolean; message?: string; error?: string }>;
}
