import type { SkillPresentation, SkillPresentationSurface, SkillVisibility } from "@vetta-org/capability-sdk";

export type { SkillPresentation, SkillPresentationSurface, SkillVisibility };

export type SkillProvenance =
	| { kind: "native"; scope: string }
	| { kind: "provided"; providerType: "plugin" | "sdk" | "runtime"; providerId: string }
	| { kind: "builtin"; providerId: string };

export interface SkillInfo {
	name: string;
	alias?: string;
	description: string;
	source: string;
	/** 结构化来源；缺失时按旧 source 兼容推断。 */
	provenance?: SkillProvenance;
	/** 提供方声明的产品展示策略；不影响运行时加载与调用。 */
	presentation?: SkillPresentation;
	/** 插件贡献的 skill 来源插件 ID；其它来源未定义。 */
	sourcePluginId?: string;
	type: "skill";
	/**
	 * 已解析的本地展示图标（若有）：Skill 自身声明优先，其次继承 Provider；
	 * 市场与内置映射仅在本字段缺失时补齐。
	 */
	icon?: string;
}

export interface MarketSkillMeta {
	name: string;
	description: string;
	type: "skill";
	version: string;
	author: string;
	tags: string[];
}

export interface InstalledMarketSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "market";
	enabled: boolean;
	type?: "skill";
	alias?: string;
	marketDescription?: string;
}

export interface InstalledCustomSkill {
	name: string;
	version: string;
	installedAt: string;
	source: "custom";
	enabled: boolean;
	/** 由 SKILL.md 的 `metadata.type` 决定；缺省按 skill。 */
	type: "skill";
	alias?: string;
	description: string;
}

export type InstalledSkill = InstalledMarketSkill | InstalledCustomSkill;

export interface SkillMarketInstallResult {
	name: string;
	type: "skill";
	version: string;
	updated: boolean;
}

export interface DesktopSkillsApi {
	/**
	 * 列出可调用资源。
	 * @param cwd 当前会话/项目 cwd，用于发现项目级 `<cwd>/.agents/skills` 与 `<cwd>/.vetta/skills`；省略则仅列全局来源。
	 */
	list(cwd?: string): Promise<SkillInfo[]>;
	/**
	 * 官方能力市场已随 vetta 服务端下线（ADR-0156），调用会直接报错。
	 * 合同保留是因为插件 SDK 的 `skills.installFromMarket` 仍是公开 API。
	 */
	installFromMarketSlug(type: "skill", slug: string): Promise<SkillMarketInstallResult>;
	importCustom(archiveBuffer: ArrayBuffer): Promise<{ name: string; type: "skill" }>;
	uninstall(name: string, type: "skill"): Promise<void>;
	toggle(name: string): Promise<void>;
	getMarketManifest(): Promise<Record<string, InstalledSkill>>;
	getSkillMdPath(name: string, type: "skill"): Promise<string>;
}
