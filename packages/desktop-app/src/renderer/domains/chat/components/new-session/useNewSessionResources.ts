import type { InstalledSkill, SkillInfo } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { fetchMarketSkills } from "@shared/lib/api";
import { useCallback, useMemo, useState } from "react";
import { SCENE_STATE_RANK } from "./constants";
import type { SceneCardState } from "./SceneCard";
import type { GuidingGroup, SceneItem } from "./types";

interface UseNewSessionResourcesResult {
	guidingGroups: GuidingGroup[];
	loadResources: () => Promise<void>;
	scenes: SceneItem[];
	skillBadges: SkillInfo[];
}

export function useNewSessionResources(decodedCwd: string, token: string | null): UseNewSessionResourcesResult {
	const [skills, setSkills] = useState<SkillInfo[]>([]);
	const [marketScenes, setMarketScenes] = useState<MarketSkillInfo[]>([]);
	const [manifest, setManifest] = useState<Record<string, InstalledSkill>>({});
	const [guidingGroups, setGuidingGroups] = useState<GuidingGroup[]>([]);

	// 拉取本地已启用技能/场景 + 市场场景目录 + 安装清单。
	// 市场拉取失败 / 未登录 / 离线时静默降级为仅本地，绝不阻断首屏。
	const loadResources = useCallback(async () => {
		const localList = await window.vetta.skills.list(decodedCwd);
		setSkills(localList);
		// 引导词来自插件（plugin.json），与 skills/scenes 是两套数据源，且不依赖登录态。
		try {
			const plugins = await window.vetta.plugins.list();
			setGuidingGroups(
				plugins
					.filter((p) => p.enabled && (p.guidingWords?.length ?? 0) > 0)
					.map((p) => ({
						id: p.id,
						name: p.name,
						words: p.guidingWords ?? [],
						defaultLocale: p.defaultLocale,
						locales: p.locales,
					})),
			);
		} catch {
			setGuidingGroups([]);
		}
		if (!token) {
			setMarketScenes([]);
			setManifest({});
			return;
		}
		try {
			const [market, mani] = await Promise.all([fetchMarketSkills(token), window.vetta.skills.getMarketManifest()]);
			setMarketScenes(market.filter((s) => s.type === "scene"));
			setManifest(mani);
		} catch {
			setMarketScenes([]);
			setManifest({});
		}
	}, [token, decodedCwd]);

	const scenes = useMemo<SceneItem[]>(() => {
		const map = new Map<string, SceneItem>();
		// 本地 skills.list() 返回的 scene 必然是「已安装且启用」，直接 active。
		// 同时覆盖非市场的 custom/user 场景，让它们照常展示为可用。
		for (const s of skills) {
			if (s.type !== "scene") continue;
			map.set(s.name, { name: s.name, alias: s.alias, description: s.description, state: "active" });
		}
		for (const ms of marketScenes) {
			if (map.has(ms.name)) continue;
			const local = manifest[ms.name];
			const state: SceneCardState = local ? (local.enabled ? "active" : "disabled") : "uninstalled";
			map.set(ms.name, {
				name: ms.name,
				alias: ms.alias,
				description: ms.description,
				state,
				version: ms.version,
				downloadCount: ms.download_count,
			});
		}
		// 已装优先排序；sort 稳定，同态内保持插入序。
		return Array.from(map.values()).sort((a, b) => SCENE_STATE_RANK[a.state] - SCENE_STATE_RANK[b.state]);
	}, [skills, marketScenes, manifest]);

	const skillBadges = useMemo(() => skills.filter((s) => s.type === "skill"), [skills]);

	return { guidingGroups, loadResources, scenes, skillBadges };
}
