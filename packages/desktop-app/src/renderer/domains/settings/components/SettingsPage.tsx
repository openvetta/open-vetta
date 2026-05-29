import { useNavigate, useParams } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { isPersonalModeAtom, type SettingsTab } from "@shared/store/atoms";
import { authUserAtom } from "@shared/store/auth-atoms";
import { cn } from "@shared/lib/utils";
import { AccountSettings } from "./AccountSettings";
import { AppearanceSettings } from "./AppearanceSettings";
import { EnvironmentSettings } from "./EnvironmentSettings";
import { GeneralSettings } from "./GeneralSettings";
import { ImBridgeSettings } from "./ImBridgeSettings";
import { ModelsSettings } from "./ModelsSettings";
import { McpSettings } from "./McpSettings";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { ArchivedProjectsSettings } from "./ArchivedProjectsSettings";
import { TeamSettings } from "./TeamSettings";
import { WebhookSettings } from "./WebhookSettings";

const BASE_TABS: { key: SettingsTab; label: string; icon: string; personalOnly?: boolean; requireAuth?: boolean }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "appearance", label: "外观", icon: "icon-[mdi--palette-outline]" },
	{ key: "account", label: "账户", icon: "icon-[mdi--account-outline]", requireAuth: true },
	{ key: "team", label: "团队管理", icon: "icon-[mdi--account-group-outline]", personalOnly: true },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
	{ key: "environment", label: "环境管理", icon: "icon-[mdi--package-variant-closed]" },
	{ key: "im", label: "Claw", icon: "icon-[mdi--message-text-outline]" },
	{ key: "webhook", label: "消息推送", icon: "icon-[mdi--webhook]" },
	{ key: "shortcuts", label: "快捷键", icon: "icon-[mdi--keyboard-outline]" },
	{ key: "archive", label: "已归档", icon: "icon-[mdi--archive-outline]" },
];

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	appearance: AppearanceSettings,
	account: AccountSettings,
	models: ModelsSettings,
	mcp: McpSettings,
	environment: EnvironmentSettings,
	im: ImBridgeSettings,
	webhook: WebhookSettings,
	shortcuts: ShortcutsSettings,
	archive: ArchivedProjectsSettings,
	team: TeamSettings,
};

export function SettingsPage(): JSX.Element {
	const { tab: rawTab } = useParams({ strict: false }) as { tab?: string };
	const navigate = useNavigate();
	const isPersonal = useAtomValue(isPersonalModeAtom);
	const authUser = useAtomValue(authUserAtom);

	const visibleTabs = useMemo(
		() => BASE_TABS.filter((t) => (!t.personalOnly || isPersonal) && (!t.requireAuth || authUser)),
		[isPersonal, authUser],
	);
	const validTabKeys = useMemo(() => new Set(visibleTabs.map((t) => t.key)), [visibleTabs]);

	const tab: SettingsTab = rawTab && validTabKeys.has(rawTab as SettingsTab) ? (rawTab as SettingsTab) : "general";
	const Content = SETTINGS_CONTENT[tab];

	return (
		<div className="relative flex h-full w-full flex-1 overflow-hidden">
			{/* Vertical divider — stops short of the bottom by titlebar-height so it doesn't touch the window edge */}
			<div className="pointer-events-none absolute left-[200px] top-0 bottom-11 w-px bg-border" />
			{/* Settings sidebar */}
			<div className="flex w-[200px] shrink-0 flex-col">
				<div className="drag-region px-5 pb-4 pt-5">
					<h1 className="text-[20px] font-bold tracking-[-0.02em] text-foreground">
						设置
					</h1>
				</div>
				<nav className="flex flex-col gap-0.5 px-2.5">
					{visibleTabs.map(({ key, label, icon }) => (
						<button
							key={key}
							type="button"
							onClick={() => void navigate({ to: "/settings/$tab", params: { tab: key } })}
							className={cn(
								"flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
								tab === key
									? "bg-accent text-foreground"
									: "text-foreground hover:bg-accent/50",
							)}
						>
							<span className={cn(icon, "h-4 w-4 shrink-0")} />
							{label}
						</button>
					))}
				</nav>
			</div>

			{/* Settings content */}
			<div className="flex flex-1 flex-col overflow-y-auto bg-background">
				{/* Drag region */}
				<div className="drag-region h-12 shrink-0" />
				<Content />
			</div>
		</div>
	);
}
