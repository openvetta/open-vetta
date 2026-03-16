import { useAtom } from "jotai";
import { settingsTabAtom, type SettingsTab } from "../store/atoms";
import { cn } from "../lib/utils";

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
];

function GeneralSettings(): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 opacity-50">
			<span className="icon-[mdi--cog-outline] h-10 w-10 text-[var(--text-3)]" />
			<p className="text-[13px] text-[var(--text-3)]">通用设置</p>
		</div>
	);
}

function ModelsSettings(): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 opacity-50">
			<span className="icon-[mdi--brain] h-10 w-10 text-[var(--text-3)]" />
			<p className="text-[13px] text-[var(--text-3)]">模型配置</p>
		</div>
	);
}

function McpSettings(): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 opacity-50">
			<span className="icon-[mdi--server-outline] h-10 w-10 text-[var(--text-3)]" />
			<p className="text-[13px] text-[var(--text-3)]">MCP 服务器</p>
		</div>
	);
}

const SETTINGS_CONTENT: Record<SettingsTab, () => JSX.Element> = {
	general: GeneralSettings,
	models: ModelsSettings,
	mcp: McpSettings,
};

export function SettingsPage(): JSX.Element {
	const [tab, setTab] = useAtom(settingsTabAtom);
	const Content = SETTINGS_CONTENT[tab];

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			{/* Settings sidebar */}
			<div className="flex w-[200px] shrink-0 flex-col border-r border-[var(--border)]">
				<div className="drag-region px-5 pb-4 pt-5">
					<h1 className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-1)]">
						设置
					</h1>
				</div>
				<nav className="flex flex-col gap-0.5 px-2.5">
					{SETTINGS_GROUPS.map(({ key, label, icon }) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							className={cn(
								"flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
								tab === key
									? "bg-[var(--hover-strong)] text-[var(--text-1)]"
									: "text-[var(--text-2)] hover:bg-[var(--hover)] hover:text-[var(--text-1)]",
							)}
						>
							<span className={cn(icon, "h-4 w-4 shrink-0")} />
							{label}
						</button>
					))}
				</nav>
			</div>

			{/* Settings content */}
			<div className="flex flex-1 flex-col overflow-y-auto">
				{/* Drag region */}
				<div className="drag-region h-12 shrink-0" />
				<Content />
			</div>
		</div>
	);
}
