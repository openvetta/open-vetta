import { useNavigate, useParams } from "@tanstack/react-router";
import { type SettingsTab } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { GeneralSettings } from "./GeneralSettings";
import { ImBridgeSettings } from "./ImBridgeSettings";
import { ModelsSettings } from "./ModelsSettings";
import { McpSettings } from "./McpSettings";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { ArchivedProjectsSettings } from "./ArchivedProjectsSettings";

const VALID_TABS = new Set<SettingsTab>(["general", "models", "mcp", "im", "shortcuts", "archive"]);

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
	{ key: "im", label: "IM 集成", icon: "icon-[mdi--message-text-outline]" },
	{ key: "shortcuts", label: "快捷键", icon: "icon-[mdi--keyboard-outline]" },
	{ key: "archive", label: "已归档", icon: "icon-[mdi--archive-outline]" },
];

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	models: ModelsSettings,
	mcp: McpSettings,
	im: ImBridgeSettings,
	shortcuts: ShortcutsSettings,
	archive: ArchivedProjectsSettings,
};

export function SettingsPage(): JSX.Element {
	const { tab: rawTab } = useParams({ strict: false }) as { tab?: string };
	const navigate = useNavigate();
	const tab: SettingsTab = rawTab && VALID_TABS.has(rawTab as SettingsTab) ? (rawTab as SettingsTab) : "general";
	const Content = SETTINGS_CONTENT[tab];

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			{/* Settings sidebar */}
			<div className="flex w-[200px] shrink-0 flex-col border-r border-border">
				<div className="drag-region px-5 pb-4 pt-5">
					<h1 className="text-[20px] font-bold tracking-[-0.02em] text-foreground">
						设置
					</h1>
				</div>
				<nav className="flex flex-col gap-0.5 px-2.5">
					{SETTINGS_GROUPS.map(({ key, label, icon }) => (
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
