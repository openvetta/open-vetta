export interface ModelsConfigData {
	/** Default model identifier: "provider/modelId" */
	defaultModel?: string;
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
			/** 预设服务商模型列表最近一次从上游 /models 同步的时间(ISO)。 */
			modelsSyncedAt?: string;
			models?: Array<{
				id: string;
				/** 上游 API 真实模型名。远程渠道下 id=网关路由 key、modelId=上游真名；缺省回退 id。 */
				modelId?: string;
				name?: string;
				api?: string;
				reasoning?: boolean;
				reasoningLevels?: string[];
				defaultReasoningLevel?: string;
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

/** 单个[[预设服务商]]:客户端内置目录条目,不含 key。 */
export interface PresetProviderInfo {
	/** 预设标识(= provider key),持久化时写入 templateId。 */
	id: string;
	displayName: string;
	api: string;
	baseUrl: string;
	/** 供应商图标 symbol。 */
	icon: string;
	/** 未填 key 时展示的种子模型;填 key 后由上游 /models 拉取的列表取代。 */
	seedModels: NonNullable<ModelsConfigData["providers"][string]["models"]>;
}

export interface PresetProvidersResult {
	providers: PresetProviderInfo[];
}

export interface PresetModelsResult {
	models: NonNullable<ModelsConfigData["providers"][string]["models"]>;
	error?: string;
}

export interface DesktopModelsApi {
	get(): Promise<ModelsConfigData>;
	set(config: ModelsConfigData): Promise<void>;
	fetchRemote(): Promise<RemoteProvidersResult>;
	/** 读取客户端内置的[[预设服务商]]目录(无网络请求)。 */
	listPresets(): Promise<PresetProvidersResult>;
	/** 按 key 拉取某预设服务商上游 `/models` 的模型列表。只拉不写,由调用方落盘。 */
	refreshPresetModels(providerId: string, apiKey?: string): Promise<PresetModelsResult>;
	/** 探测某 (provider, model) 的 baseUrl 是否可达(本地 models.json 优先,回退云端目录)。仅判可达性,任何 HTTP 响应都算通。 */
	probe(ref: { provider: string; model: string }): Promise<{ ok: boolean; message?: string; error?: string }>;
	/** 拉取本地自定义 provider 的 `GET {baseUrl}/models`,返回上游模型 id 列表,用于快速填写模型配置。 */
	fetchProviderModels(providerName: string): Promise<{ models: string[]; error?: string }>;
}
