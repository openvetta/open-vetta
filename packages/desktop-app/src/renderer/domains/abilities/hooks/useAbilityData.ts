/**
 * 能力页的原始数据源：市场行 + 安装台账 + 三条安装轨道的本地状态。
 * 只负责取数与刷新，条目组装在 lib/build-ability-items.ts。
 */
import type { AbilityLedger, InstalledPlugin, InstalledSkill, SkillInfo } from "@preload/api";
import { i18n } from "@shared/i18n";
import type { MarketAbility } from "@shared/lib/api";
import { fetchMarketAbilities } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useState } from "react";

export interface AbilityData {
	market: MarketAbility[];
	ledger: AbilityLedger;
	skillManifest: Record<string, InstalledSkill>;
	/** 通用 Agent / 内置 skill 与 scene（只读展示）。 */
	localSkills: SkillInfo[];
	plugins: InstalledPlugin[];
	loading: boolean;
	refreshing: boolean;
	error: string | null;
	refresh: () => void;
}

function isReadonlySkillSource(source: string): boolean {
	return source.startsWith("agents-") || source === "builtin";
}

export function useAbilityData(): AbilityData {
	const token = useAtomValue(authTokenAtom);
	const [market, setMarket] = useState<MarketAbility[]>([]);
	const [ledger, setLedger] = useState<AbilityLedger>({});
	const [skillManifest, setSkillManifest] = useState<Record<string, InstalledSkill>>({});
	const [localSkills, setLocalSkills] = useState<SkillInfo[]>([]);
	const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(() => {
		setRefreshing(true);
		const local = Promise.all([
			window.vetta.abilities.getLedger(),
			window.vetta.skills.getMarketManifest(),
			window.vetta.skills.list(),
			window.vetta.plugins.list(),
		]).then(([nextLedger, manifest, skills, installedPlugins]) => {
			setLedger(nextLedger);
			setSkillManifest(manifest);
			setLocalSkills(skills.filter((skill) => isReadonlySkillSource(skill.source)));
			setPlugins(installedPlugins);
		});

		const remote = token
			? fetchMarketAbilities(token).then((list) => {
					setMarket(list);
					setError(null);
				})
			: Promise.resolve().then(() => {
					// 未登录：仅展示本地已安装 / 内置能力，不报错。
					setMarket([]);
					setError(null);
				});

		void Promise.all([local, remote])
			.catch((err: Error) => {
				setError(err.message || i18n.t("abilities:error.loadFailed"));
			})
			.finally(() => {
				setLoading(false);
				setRefreshing(false);
			});
	}, [token]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return { market, ledger, skillManifest, localSkills, plugins, loading, refreshing, error, refresh };
}
