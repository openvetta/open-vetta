import type { InstalledSkill, SkillInfo } from "@preload/api";
import { i18n } from "@shared/i18n";
import type { MarketSkillInfo } from "@shared/lib/api";
import { downloadSkill, fetchMarketSkills } from "@shared/lib/api";
import { authTokenAtom, filePreviewAtom, pageHeaderTitleHiddenAtom } from "@shared/store/atoms";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import type { ChangeEvent, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type TypeTab = "scene" | "capability";
export type ActionState = "idle" | "loading" | "done";

// 渲染期解析为 t("group.uncategorized")（模块级常量不存中文）。
export const UNCATEGORIZED = "__uncategorized__";

export interface MergedSkill {
	name: string;
	alias: string;
	description: string;
	type: "skill" | "scene";
	version: string;
	author: string;
	tags: string[];
	category: string;
	/** 空=默认；solar:xxx-bold；或已解析绝对图 URL */
	icon?: string;
	installed: boolean;
	enabled: boolean;
	needsUpdate: boolean;
	localVersion?: string;
	isCustom?: boolean;
	/** 通用 Agent Skill（~/.agents/skills）：只读展示，不可安装/卸载/启停。 */
	isAgent?: boolean;
	downloadCount: number;
	license: string;
}

function mergeSkills(marketSkills: MarketSkillInfo[], manifest: Record<string, InstalledSkill>): MergedSkill[] {
	const merged = new Map<string, MergedSkill>();

	for (const ms of marketSkills) {
		const local = manifest[ms.name];
		const isMarketLocal = local?.source === "market";
		const installed = isMarketLocal;
		const needsUpdate = isMarketLocal && local.version !== ms.version;
		merged.set(ms.name, {
			name: ms.name,
			alias: ms.alias,
			description: ms.description,
			type: ms.type,
			version: ms.version,
			author: ms.author,
			tags: ms.tags,
			category: ms.category,
			icon: ms.icon || undefined,
			installed,
			enabled: installed ? local.enabled : false,
			needsUpdate,
			localVersion: isMarketLocal ? local.version : undefined,
			downloadCount: ms.download_count ?? 0,
			license: ms.license,
		});
	}

	for (const [name, local] of Object.entries(manifest)) {
		if (local.source === "custom") continue;
		if (!merged.has(name)) {
			merged.set(name, {
				name,
				alias: "",
				description: "",
				type: local.type === "scene" ? "scene" : "skill",
				version: local.version,
				author: "",
				tags: [],
				category: "",
				installed: true,
				enabled: local.enabled,
				needsUpdate: false,
				localVersion: local.version,
				downloadCount: 0,
				license: "",
			});
		}
	}

	return Array.from(merged.values());
}

function buildCustomSkills(manifest: Record<string, InstalledSkill>): MergedSkill[] {
	const list: MergedSkill[] = [];
	for (const entry of Object.values(manifest)) {
		if (entry.source !== "custom") continue;
		list.push({
			name: entry.name,
			alias: entry.alias ?? "",
			description: entry.description,
			type: "skill",
			version: entry.version,
			author: "",
			tags: [],
			category: "",
			installed: true,
			enabled: entry.enabled,
			needsUpdate: false,
			localVersion: entry.version,
			isCustom: true,
			downloadCount: 0,
			license: "",
		});
	}
	list.sort((a, b) => {
		if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
	return list;
}

export function groupByCategory(skills: MergedSkill[]): Map<string, MergedSkill[]> {
	const groups = new Map<string, MergedSkill[]>();
	for (const skill of skills) {
		const category = skill.category || UNCATEGORIZED;
		const group = groups.get(category);
		if (group) {
			group.push(skill);
		} else {
			groups.set(category, [skill]);
		}
	}
	for (const group of groups.values()) {
		group.sort((a, b) => {
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			if (a.installed !== b.installed) return a.installed ? -1 : 1;
			// 同等安装态下按热度（下载量）降序，便于区分热门
			if (a.downloadCount !== b.downloadCount) return b.downloadCount - a.downloadCount;
			return a.name.localeCompare(b.name);
		});
	}
	return groups;
}

export interface SkillsPageModel {
	typeTab: TypeTab;
	setTypeTab: (tab: TypeTab) => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	loading: boolean;
	error: string | null;
	actionStates: Record<string, ActionState>;
	importing: boolean;
	selectedSkill: MergedSkill | null;
	setSelectedSkill: (skill: MergedSkill | null) => void;
	fileInputRef: RefObject<HTMLInputElement | null>;
	groups: Map<string, MergedSkill[]>;
	agentForTab: MergedSkill[];
	capabilitySkills: MergedSkill[];
	hasContent: boolean;
	sectionId?: string;
	handleInstall: (skill: MergedSkill) => void;
	handleToggle: (name: string) => void;
	handleUninstall: (name: string, type: "skill" | "scene") => void;
	handlePreview: (skill: MergedSkill) => void;
	handleImportClick: () => void;
	handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
	refreshCapabilities: () => void;
}

export function useSkillsPageModel(options?: { mode?: TypeTab }): SkillsPageModel {
	const pageMode: TypeTab = options?.mode ?? "capability";
	const search = useSearch({ strict: false }) as {
		/** skill / connector 为旧深链，统一映射到 capability；plugin / scene 会重定向。 */
		tab?: TypeTab | "skill" | "connector" | "plugin";
		section?: string;
		nav?: string;
	};
	const navigate = useNavigate();
	// 页面由路由固定 mode：/skills → capability，/scenes → scene。
	const typeTab: TypeTab = pageMode;
	const [searchQuery, setSearchQuery] = useState("");
	const [marketSkills, setMarketSkills] = useState<MarketSkillInfo[]>([]);
	const [manifest, setManifest] = useState<Record<string, InstalledSkill>>({});
	// 通用 Agent Skill（全局 ~/.agents/skills）：只读分区数据，与市场/自定义无关。
	const [agentSkills, setAgentSkills] = useState<SkillInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
	const [importing, setImporting] = useState(false);
	const [selectedSkill, setSelectedSkill] = useState<MergedSkill | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const highlightingRef = useRef(false);

	const token = useAtomValue(authTokenAtom);
	const setFilePreview = useSetAtom(filePreviewAtom);
	const setHeaderTitleHidden = useSetAtom(pageHeaderTitleHiddenAtom);

	const setTypeTab = useCallback(
		(tab: TypeTab) => {
			if (tab === typeTab) return;
			void navigate({
				to: tab === "scene" ? "/scenes" : "/skills",
				search: {},
				replace: true,
			});
		},
		[navigate, typeTab],
	);

	// 旧深链：/skills?tab=plugin → 插件页；/skills?tab=scene → 场景页。
	useEffect(() => {
		if (pageMode !== "capability") return;
		if (search.tab === "plugin") {
			void navigate({ to: "/plugins", replace: true });
			return;
		}
		if (search.tab === "scene") {
			void navigate({ to: "/scenes", replace: true });
		}
	}, [navigate, pageMode, search.tab]);

	// 历史连接配置 section 深链高亮；`navigationNonce` 变化时重新触发（与设置页一致）。
	const navigationNonce = search.nav;
	useEffect(() => {
		if (typeTab !== "capability" || !search.section || highlightingRef.current) return;
		void navigationNonce;
		const element = document.getElementById(search.section);
		if (!element) return;

		highlightingRef.current = true;
		element.scrollIntoView({ behavior: "smooth", block: "center" });
		const target =
			document.querySelector<HTMLElement>(`[data-setting-section-highlight-target="${search.section}"]`) ??
			(element.closest(".mb-6") as HTMLElement | null) ??
			element;
		const timer = setTimeout(() => {
			target.classList.add("setting-section-breathe");
		}, 500);
		const cleanupTimer = setTimeout(() => {
			target.classList.remove("setting-section-breathe");
			highlightingRef.current = false;
		}, 4100);
		return () => {
			clearTimeout(timer);
			clearTimeout(cleanupTimer);
			target.classList.remove("setting-section-breathe");
			highlightingRef.current = false;
		};
	}, [typeTab, search.section, navigationNonce]);

	const refresh = useCallback(() => {
		void window.vetta.skills.getMarketManifest().then(setManifest);
		// 全局通用 Agent Skill（不传 cwd → 仅 ~/.agents/skills），只读展示。
		void window.vetta.skills
			.list()
			.then((list) => setAgentSkills(list.filter((s) => s.source.startsWith("agents-"))));
	}, []);

	const loadMarket = useCallback(() => {
		if (!token) {
			// 未登录：不拉取市场数据，但仍展示本地已安装/自定义/Agent 技能。
			setMarketSkills([]);
			setError(null);
			setLoading(false);
			return;
		}
		setLoading(true);
		setError(null);
		void fetchMarketSkills(token)
			.then((list) => {
				setMarketSkills(list);
				setError(null);
			})
			.catch((err: Error) => {
				setError(err.message || i18n.t("skills:error.loadFailed"));
			})
			.finally(() => setLoading(false));
	}, [token]);

	const refreshCapabilities = useCallback(() => {
		refresh();
		loadMarket();
	}, [loadMarket, refresh]);

	useEffect(() => {
		refresh();
		loadMarket();
	}, [refresh, loadMarket]);

	// 扩展/场景页不显示顶栏左上角标题（页面内已有大号标题）。
	useEffect(() => {
		setHeaderTitleHidden(true);
		return () => setHeaderTitleHidden(false);
	}, [setHeaderTitleHidden]);

	const setActionState = useCallback((name: string, state: ActionState) => {
		setActionStates((prev) => ({ ...prev, [name]: state }));
	}, []);

	const handleInstall = useCallback(
		(skill: MergedSkill) => {
			if (!token) return;
			setActionState(skill.name, "loading");
			void downloadSkill(token, skill.name)
				.then((buffer) =>
					window.vetta.skills.installFromMarket(skill.name, buffer, skill.type, {
						alias: skill.alias,
						marketDescription: skill.description,
						version: skill.version,
					}),
				)
				.then(() => {
					setActionState(skill.name, "done");
					refresh();
				})
				.catch((err: Error) => {
					setActionState(skill.name, "idle");
					console.error("安装失败:", err.message);
				});
		},
		[token, refresh, setActionState],
	);

	const handleToggle = useCallback(
		(name: string) => {
			void window.vetta.skills
				.toggle(name)
				.then(() => refresh())
				.catch((err: Error) => {
					console.error("切换失败:", err.message);
				});
		},
		[refresh],
	);

	const handleUninstall = useCallback(
		(name: string, type: "skill" | "scene") => {
			setActionState(name, "loading");
			void window.vetta.skills
				.uninstall(name, type)
				.then(() => {
					setActionState(name, "idle");
					refresh();
				})
				.catch((err: Error) => {
					setActionState(name, "idle");
					console.error("卸载失败:", err.message);
				});
		},
		[refresh, setActionState],
	);

	const handlePreview = useCallback(
		(skill: MergedSkill) => {
			if (skill.installed || skill.isAgent) {
				void window.vetta.skills
					.getSkillMdPath(skill.name, skill.type)
					.then((path) => {
						setFilePreview({
							name: `${skill.alias || skill.name} — SKILL.md`,
							path,
						});
					})
					.catch((err: Error) => {
						console.error("打开预览失败:", err.message);
					});
			} else {
				setSelectedSkill(skill);
			}
		},
		[setFilePreview],
	);

	const handleImportClick = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0];
			event.target.value = "";
			if (!file) return;
			setImporting(true);
			void file
				.arrayBuffer()
				.then((buffer) => window.vetta.skills.importCustom(buffer))
				.then(() => {
					refresh();
				})
				.catch((err: Error) => {
					alert(i18n.t("skills:import.failed", { error: err.message || i18n.t("skills:import.unknownError") }));
				})
				.finally(() => setImporting(false));
		},
		[refresh],
	);

	const merged = useMemo(() => mergeSkills(marketSkills, manifest), [marketSkills, manifest]);

	const filterBySearch = useCallback(
		(list: MergedSkill[]) => {
			const q = searchQuery.trim().toLowerCase();
			if (!q) return list;
			return list.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.alias.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					s.tags.some((tag) => tag.toLowerCase().includes(q)),
			);
		},
		[searchQuery],
	);

	const filtered = useMemo(
		() => (typeTab === "scene" ? filterBySearch(merged.filter((s) => s.type === "scene")) : []),
		[merged, typeTab, filterBySearch],
	);

	const groups = useMemo(() => groupByCategory(filtered), [filtered]);

	// 场景页的通用 Agent Scene 只读分区。
	const agentForTab = useMemo<MergedSkill[]>(
		() =>
			typeTab === "scene"
				? filterBySearch(
						agentSkills
							.filter((s) => s.type === "scene")
							.map((s) => ({
								name: s.name,
								alias: s.alias ?? "",
								description: s.description,
								type: s.type,
								version: "",
								author: "",
								tags: [],
								category: "",
								installed: true,
								enabled: true,
								needsUpdate: false,
								isAgent: true,
								downloadCount: 0,
								license: "",
							})),
					)
				: [],
		[agentSkills, typeTab, filterBySearch],
	);

	const capabilitySkills = useMemo<MergedSkill[]>(
		() => [
			...merged.filter((skill) => skill.type === "skill"),
			...buildCustomSkills(manifest),
			...agentSkills
				.filter((skill) => skill.type === "skill")
				.map((skill) => ({
					name: skill.name,
					alias: skill.alias ?? "",
					description: skill.description,
					type: "skill" as const,
					version: "",
					author: "",
					tags: [],
					category: "",
					installed: true,
					enabled: true,
					needsUpdate: false,
					isAgent: true,
					downloadCount: 0,
					license: "",
				})),
		],
		[agentSkills, manifest, merged],
	);

	const hasContent = groups.size > 0 || agentForTab.length > 0;

	return {
		typeTab,
		setTypeTab,
		searchQuery,
		setSearchQuery,
		loading,
		error,
		actionStates,
		importing,
		selectedSkill,
		setSelectedSkill,
		fileInputRef,
		groups,
		agentForTab,
		capabilitySkills,
		hasContent,
		sectionId: search.section,
		handleInstall,
		handleToggle,
		handleUninstall,
		handlePreview,
		handleImportClick,
		handleFileChange,
		refreshCapabilities,
	};
}
