import type { MediaProviderDescriptor } from "@vetta-org/capability-sdk";

export interface AudioMetadata {
	/** 内嵌标签标题，无则渲染端回退文件名 */
	title?: string;
	artist?: string;
	/** 内嵌封面（ID3 APIC / FLAC picture）的 DataURL，无封面为 undefined */
	coverDataUrl?: string;
}

/** 自定义 OpenAI 兼容图片服务（ADR-0141）。渲染进程只看得到 `hasApiKey`，读不到 key 本身。 */
export interface CustomImageProviderSummary {
	id: string;
	name: string;
	baseUrl: string;
	model: string;
	supportsTextToImage: boolean;
	supportsImageToImage: boolean;
	hasApiKey: boolean;
}

export interface CustomImageProviderInput {
	/** 缺省表示新增。 */
	id?: string;
	name: string;
	baseUrl: string;
	model: string;
	supportsTextToImage: boolean;
	supportsImageToImage: boolean;
	/** 单向写入：新增必填，编辑留空表示沿用已存的 key。 */
	apiKey?: string;
}

export interface DesktopMediaApi {
	customImageProviders: {
		list(): Promise<CustomImageProviderSummary[]>;
		save(input: CustomImageProviderInput): Promise<CustomImageProviderSummary>;
		remove(id: string): Promise<void>;
	};
	/** 列出当前已注册的媒体 Provider，供 Agent 设置页展示能力与选择。 */
	listProviders(): Promise<MediaProviderDescriptor[]>;
	/** 解析本地音频文件的内嵌元数据（主进程 music-metadata），解析失败返回空对象 */
	getAudioMetadata(filePath: string): Promise<AudioMetadata>;
}
