import { useAtom } from "jotai";
import { useCallback } from "react";
import { settingsTabAtom, workspacePathAtom, type SettingsTab } from "../store/atoms";
import { cn } from "../lib/utils";

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
];

function GeneralSettings(): JSX.Element {
	const [workspacePath, setWorkspacePath] = useAtom(workspacePathAtom);

	const handleSelectWorkspace = useCallback(async () => {
		const selected = await window.vetta.dialog.selectFolder();
		if (selected) {
			setWorkspacePath(selected);
			localStorage.setItem("vetta-workspace-path", selected);
			await window.vetta.config.set({ workspacePath: selected });
		}
	}, [setWorkspacePath]);

	const handleResetWorkspace = useCallback(async () => {
		const defaultPath = "~/.vetta/workspace";
		setWorkspacePath(defaultPath);
		localStorage.setItem("vetta-workspace-path", defaultPath);
		await window.vetta.config.set({ workspacePath: defaultPath });
	}, [setWorkspacePath]);

	return (
		<div className="mx-auto w-full max-w-[520px] px-6 py-2">
			{/* 工作目录设置 */}
			<div className="rounded-xl border border-[var(--border)] bg-[var(--bg-2)] p-4">
				<div className="mb-1 flex items-center gap-2">
					<span className="icon-[mdi--folder-cog-outline] h-4 w-4 text-[var(--text-2)]" />
					<span className="text-[13px] font-medium text-[var(--text-1)]">工作目录</span>
				</div>
				<p className="mb-3 text-[12px] text-[var(--text-3)]">
					新建项目时将在此目录下创建对应的项目文件夹。
				</p>
				<div className="flex items-center gap-2">
					<div className="flex min-w-0 flex-1 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-1)] px-3 py-1.5">
						<span className="icon-[mdi--folder-outline] mr-2 h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
						<span className="truncate text-[12px] text-[var(--text-2)]">{workspacePath}</span>
					</div>
					<button
						type="button"
						onClick={() => void handleSelectWorkspace()}
						className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--hover)]"
					>
						更改
					</button>
					<button
						type="button"
						onClick={() => void handleResetWorkspace()}
						className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] text-[var(--text-3)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text-2)]"
						title="恢复默认"
					>
						<span className="icon-[mdi--restore] h-3.5 w-3.5" />
					</button>
				</div>
			</div>
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
