import type { InstalledSkill } from "@preload/api";
import type { PluginLocales } from "@vetta/plugin-sdk";
import type { SceneCardActionState, SceneCardModel } from "./SceneCard";

export type SceneItem = SceneCardModel;
export type SceneActionState = SceneCardActionState;
export type SkillSelection = Pick<InstalledSkill, "name" | "alias" | "type"> | null;

// 引导词分组：一组对应一个启用且声明了非空 guidingWords 的插件，组标题取插件 name。
export interface GuidingGroup {
	id: string;
	name: string;
	words: string[];
	defaultLocale: string;
	locales: PluginLocales;
}
