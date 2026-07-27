import type { InstalledSkill, SkillInfo } from "@preload/api";
import type { MarketSkillInfo } from "@shared/lib/api";
import { fetchMarketSkills } from "@shared/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCENE_STATE_RANK } from "./constants";
import type { SceneCardState } from "./SceneCard";
import type { GuidingGroup, SceneItem } from "./types";

interface ResourcesState {
	guidingGroups: GuidingGroup[];
	loaded: boolean;
	manifest: Record<string, InstalledSkill>;
	marketScenes: MarketSkillInfo[];
	skills: SkillInfo[];
}

const EMPTY_RESOURCES: ResourcesState = {
	guidingGroups: [],
	loaded: false,
	manifest: {},
	marketScenes: [],
	skills: [],
};

interface UseNewSessionResourcesResult {
	guidingGroups: GuidingGroup[];
	loadResources: () => Promise<void>;
	/** 本地 + 市场资源是否已完成至少一轮拉取（成功或降级）。 */
	resourcesLoaded: boolean;
	scenes: SceneItem[];
	skillBadges: SkillInfo[];
}

export function useNewSessionResources(decodedCwd: string, token: string | null): UseNewSessionResourcesResult {
	const [state, setState] = useState<ResourcesState>(EMPTY_RESOURCES);
	const loadGenRef = useRef(0);

	// cwd / 登录态变化时收回旧数据并重新占位，避免短暂显示上一个项目的场景/技能。
	useEffect(() => {
		// 依赖作 reset key；body 只清状态，不直接读值。
		void decodedCwd;
		void token;
		loadGenRef.current += 1;
		setState(EMPTY_RESOURCES);
	}, [decodedCwd, token]);

	// 拉取本地已启用技能/场景 + 市场场景目录 + 安装清单。
	// 市场拉取失败 / 未登录 / 离线时静默降级为仅本地，绝不阻断首屏。
	// 全部数据在一次 setState 落盘，避免 skills → guiding → market 分批 set 造成多次布局抖动。
	const loadResources = useCallback(async () => {
		const gen = loadGenRef.current;
		const localList = await window.vetta.skills.list(decodedCwd);
		if (gen !== loadGenRef.current) return;

		let guidingGroups: GuidingGroup[] = [];
		try {
			const plugins = await window.vetta.plugins.list();
			guidingGroups = plugins
				.filter((p) => p.enabled && (p.guidingWords?.length ?? 0) > 0)
				.map((p) => ({
					id: p.id,
					name: p.name,
					words: p.guidingWords ?? [],
					defaultLocale: p.defaultLocale,
					locales: p.locales,
				}));
		} catch {
			guidingGroups = [];
		}
		if (gen !== loadGenRef.current) return;

		let marketScenes: MarketSkillInfo[] = [];
		let manifest: Record<string, InstalledSkill> = {};
		if (token) {
			try {
				const [market, mani] = await Promise.all([
					fetchMarketSkills(token),
					window.vetta.skills.getMarketManifest(),
				]);
				marketScenes = market.filter((s) => s.type === "scene");
				manifest = mani;
			} catch {
				marketScenes = [];
				manifest = {};
			}
		}
		if (gen !== loadGenRef.current) return;

		setState({
			skills: localList,
			guidingGroups,
			marketScenes,
			manifest,
			loaded: true,
		});
	}, [token, decodedCwd]);

	const scenes = useMemo<SceneItem[]>(() => {
		const map = new Map<string, SceneItem>();
		// 本地 skills.list() 返回的 scene 必然是「已安装且启用」，直接 active。
		// 同时覆盖非市场的 custom/user 场景，让它们照常展示为可用。
		for (const s of state.skills) {
			if (s.type !== "scene") continue;
			map.set(s.name, { name: s.name, alias: s.alias, description: s.description, state: "active" });
		}
		for (const ms of state.marketScenes) {
			if (map.has(ms.name)) continue;
			const local = state.manifest[ms.name];
			const sceneState: SceneCardState = local ? (local.enabled ? "active" : "disabled") : "uninstalled";
			map.set(ms.name, {
				name: ms.name,
				alias: ms.alias,
				description: ms.description,
				state: sceneState,
				version: ms.version,
				downloadCount: ms.download_count,
			});
		}
		// 已装优先排序；sort 稳定，同态内保持插入序。
		return Array.from(map.values()).sort((a, b) => SCENE_STATE_RANK[a.state] - SCENE_STATE_RANK[b.state]);
	}, [state.skills, state.marketScenes, state.manifest]);

	const skillBadges = useMemo(() => state.skills.filter((s) => s.type === "skill"), [state.skills]);

	return {
		guidingGroups: state.guidingGroups,
		loadResources,
		resourcesLoaded: state.loaded,
		scenes,
		skillBadges,
	};
}
