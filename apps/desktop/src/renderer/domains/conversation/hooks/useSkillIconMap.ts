/**
 * skill 的市场图标目录加载。命令区解析顺序见 `skillIconOf`：
 * GitHub 开放市场目录 → SkillInfo.icon（插件宿主图）→ 内置静态资源 → 默认图。
 * 这里只负责市场半边；插件 / 内置不进这份 map。
 *
 * 解析口径本身是纯逻辑，住在 lib/skill-token-meta。
 */
import { useEffect, useState } from "react";
import type { SkillIconMap } from "../lib/skill-token-meta";

export { type SkillIconMap, skillIconOf } from "../lib/skill-token-meta";

const EMPTY_ICON_MAP: SkillIconMap = new Map();

/** 缓存整份目录解析结果：命令区反复开合不该反复打网络。 */
let iconMapPromise: Promise<SkillIconMap> | null = null;

/** 取数失败只是少几个图标，绝不让命令区打不开。 */
async function loadSkillIconMap(): Promise<SkillIconMap> {
	const map = new Map<string, string>();
	const catalog = await window.vetta.abilities.listOpenMarketplaces().catch(() => null);
	for (const entry of catalog?.abilities ?? []) {
		if (entry.type !== "skill") continue;
		if (!entry.icon) continue;
		const key = `${entry.type}:${entry.slug}`;
		// 先到先得：同一 slug 出现在多个来源时按来源优先级取第一份图标。
		if (!map.has(key)) map.set(key, entry.icon);
	}
	return map;
}

/**
 * enabled 为 false 时不发起加载：命令区没展开过就不该为图标去拉目录。
 *
 * `prefetch` 为真时提前拉：目录解析要打网络，等展开那一刻才发起的话，结果会在高度动画
 * 进行中才到位，整列图标同时换图（远程 `<img>` 首次还要走网络与解码），动画就顿在那里。
 */
export function useSkillIconMap(enabled: boolean, prefetch = false): SkillIconMap {
	const [map, setMap] = useState<SkillIconMap>(EMPTY_ICON_MAP);

	useEffect(() => {
		if (!enabled && !prefetch) return;
		let alive = true;
		if (!iconMapPromise) iconMapPromise = loadSkillIconMap();
		void iconMapPromise.then((next) => {
			if (alive) setMap(next);
		});
		return () => {
			alive = false;
		};
	}, [enabled, prefetch]);

	return map;
}
