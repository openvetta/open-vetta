import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { isPersonalModeAtom, type SettingsTab } from "@shared/store/atoms";
import { authUserAtom } from "@shared/store/auth-atoms";
import { cn } from "@shared/lib/utils";
import { isMac } from "@shared/lib/platform";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { AgentSettings } from "./AgentSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { GeneralSettings } from "./GeneralSettings";
import { ImBridgeSettings } from "./ImBridgeSettings";
import { ModelsSettings } from "./ModelsSettings";
import { McpSettings } from "./McpSettings";
import { PermissionsSettings } from "./PermissionsSettings";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { ArchivedProjectsSettings } from "./ArchivedProjectsSettings";
import { TeamSettings } from "./TeamSettings";
import { WebhookSettings } from "./WebhookSettings";
import { findSettingsSection, SETTINGS_TABS } from "../registry";
import "./settings-highlight.css";

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	appearance: AppearanceSettings,
	account: AccountSettings,
	models: ModelsSettings,
	mcp: McpSettings,
	environment: EnvironmentSettings,
	permissions: PermissionsSettings,
	im: ImBridgeSettings,
	webhook: WebhookSettings,
	shortcuts: ShortcutsSettings,
	archive: ArchivedProjectsSettings,
	team: TeamSettings,
	context: AgentSettings,
};

export function SettingsPage(): JSX.Element {
	const { tab: rawTab } = useParams({ strict: false }) as { tab?: string };
	const navigate = useNavigate();
	const isPersonal = useAtomValue(isPersonalModeAtom);
	const authUser = useAtomValue(authUserAtom);
	const narrow = useNarrowScreen();

	const visibleTabs = useMemo(
		() =>
			SETTINGS_TABS.filter(
				(t) =>
					(!t.personalOnly || isPersonal) &&
					(!t.requireAuth || authUser) &&
					(!t.macOnly || isMac),
			),
		[isPersonal, authUser],
	);
	const validTabKeys = useMemo(() => new Set(visibleTabs.map((t) => t.key)), [visibleTabs]);

	const tab: SettingsTab = rawTab && validTabKeys.has(rawTab as SettingsTab) ? (rawTab as SettingsTab) : "general";
	const Content = SETTINGS_CONTENT[tab];

	const search = useSearch({ strict: false }) as Record<string, unknown>;
	const sectionId = typeof search.section === "string"
		? search.section
		: typeof search.h2 === "string"
			? search.h2
			: undefined;
	const navigationNonce = typeof search.nav === "string" ? search.nav : undefined;
	const targetSection = sectionId ? findSettingsSection(sectionId) : undefined;
	const highlightingRef = useRef(false);

	useEffect(() => {
		if (!targetSection || targetSection.tab === tab || !validTabKeys.has(targetSection.tab)) return;
		void navigate({
			to: "/settings/$tab",
			params: { tab: targetSection.tab },
			search: { section: targetSection.id },
		});
	}, [navigate, tab, targetSection, validTabKeys]);

	useEffect(() => {
		if (!targetSection || targetSection.tab !== tab || highlightingRef.current) return;

		const el = document.getElementById(targetSection.id);
		if (!el) return;

		highlightingRef.current = true;

		el.scrollIntoView({ behavior: "smooth", block: "center" });

		const target = document.querySelector<HTMLElement>(
			`[data-setting-section-highlight-target="${targetSection.id}"]`,
		) ?? (el.closest(".mb-6") as HTMLElement | null) ?? el;

		if (!target) {
			highlightingRef.current = false;
			return;
		}

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
	}, [tab, targetSection, navigationNonce]);

	return (
		<div className="relative flex h-full w-full flex-1 overflow-hidden">
			{/* Vertical divider — stops short of the bottom by titlebar-height so it doesn't touch the window edge */}
			<div
				className={cn(
					"pointer-events-none absolute top-0 bottom-11 w-px bg-border",
					narrow ? "left-14" : "left-[200px]",
				)}
			/>
			{/* Settings sidebar — 窄屏收成 icon-only 竖排，避免挤压右侧主内容 */}
			<div className={cn("flex shrink-0 flex-col", narrow ? "w-14" : "w-[200px]")}>
				<div className={cn("drag-region", narrow ? "h-12" : "px-5 pb-4 pt-5")}>
					{!narrow && (
						<h1 className="text-[20px] font-bold tracking-[-0.02em] text-foreground">
							设置
						</h1>
					)}
				</div>
				<nav className={cn("flex flex-col gap-0.5", narrow ? "px-2" : "px-2.5")}>
					{visibleTabs.map(({ key, label, icon }) => (
						<button
							key={key}
							type="button"
							title={narrow ? label : undefined}
							onClick={() => void navigate({ to: "/settings/$tab", params: { tab: key } })}
							className={cn(
								"flex items-center rounded-lg text-[13px] font-medium transition-colors",
								narrow ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-[7px]",
								tab === key
									? "bg-accent text-foreground"
									: "text-foreground hover:bg-accent/50",
							)}
						>
							<span className={cn(icon, "h-4 w-4 shrink-0")} />
							{!narrow && label}
						</button>
					))}
				</nav>
			</div>

			{/* Settings content */}
			<div className="no-scrollbar flex flex-1 flex-col overflow-y-auto bg-background">
				{/* Drag region */}
				<div className="drag-region h-12 shrink-0" />
				<Content />
			</div>
		</div>
	);
}
