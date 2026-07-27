/** 能力形态。与服务端 model.AbilityType* 一一对应。 */
export type AbilityType = "skill" | "scene" | "mcp" | "plugin" | "bundle";

export const ABILITY_TYPES: readonly AbilityType[] = ["skill", "scene", "mcp", "plugin", "bundle"];

/** 有产物的形态：必须随包提交，产物是安装的物理来源。 */
export const ARTIFACT_TYPES: readonly AbilityType[] = ["skill", "scene", "plugin"];

/** 详情页头图。宿主只认这两个模板，未知值客户端会跳过。 */
export interface AbilityShowcase {
	template: "chat-over-canvas" | "chat-thread";
	user_prompt: string;
	assistant_reply: string;
	/** 仅 chat-over-canvas */
	canvas?: "design" | "code" | "docs" | "generic";
	brand_icon_url?: string;
	brand_name?: string;
}

/** 详情页元信息条目。有 key 用预置项（客户端按语言出 label），否则用自填 label。 */
export interface AbilityMetaEntry {
	key?: "homepage" | "repository" | "docs" | "license";
	label?: string;
	value: string;
}

/** 单个语言的译文覆盖。字段留空表示该语言回落默认值。 */
export interface AbilityDetailLocale {
	name?: string;
	description?: string;
	content?: string;
	showcases?: AbilityShowcase[];
	meta?: AbilityMetaEntry[];
}

/**
 * raw.detail：能力全部展示信息的唯一真相源。
 * 顶层是默认语言，i18n[locale] 覆盖其它语言，两者同构。
 */
export interface AbilityDetail {
	name?: string;
	description?: string;
	license?: string;
	author?: string;
	/** 空 / solar:xxx-bold / http(s):// */
	icon?: string;
	tags?: string[];
	showcases?: AbilityShowcase[];
	meta?: AbilityMetaEntry[];
	/** markdown 正文 */
	content?: string;
	i18n?: Record<string, AbilityDetailLocale>;
}

/** bundle 成员。引用已上架条目；仅 mcp 允许 inline 私有配置。 */
export interface AbilityBundleMember {
	type: Exclude<AbilityType, "bundle">;
	slug: string;
	inline?: Record<string, unknown>;
}

/** upload_ability 的入参。 */
export interface UploadAbilityInput {
	type: AbilityType;
	/** mcp / bundle 必填；skill/scene/plugin 由包内 manifest 决定，传了也会被忽略 */
	slug?: string;
	/** 有产物类型必填：本地安装包的绝对路径（.zip / .tar.gz） */
	package_path?: string;
	detail: AbilityDetail;
	/** 仅 mcp：写进 mcp.json 的配置块 */
	mcp_config?: Record<string, unknown>;
	/** 仅 bundle：成员清单 */
	members?: AbilityBundleMember[];
	/** 分类名（受管分类，匹配不上则为未分类） */
	category?: string;
	version?: string;
}
