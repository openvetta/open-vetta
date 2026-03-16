import { useAtom } from "jotai";
import { useCallback } from "react";
import { settingsTabAtom, workspacePathAtom, type SettingsTab } from "../store/atoms";
import { cn } from "../lib/utils";

const SETTINGS_GROUPS: { key: SettingsTab; label: string; icon: string }[] = [
	{ key: "general", label: "通用设置", icon: "icon-[mdi--cog-outline]" },
	{ key: "models", label: "模型配置", icon: "icon-[mdi--brain]" },
	{ key: "mcp", label: "MCP 服务器", icon: "icon-[mdi--server-outline]" },
];

// ─── Shared setting row layout ───

function SettingRow({
	title,
	description,
	children,
	border = true,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	border?: boolean;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-6 px-5 py-4",
				border && "border-b border-[var(--border)]",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-[var(--text-1)]">{title}</div>
				{description && (
					<div className="mt-0.5 text-[12px] text-[var(--text-2)]">{description}</div>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

function SettingSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className="mb-6">
			<h2 className="mb-3 text-[15px] font-semibold text-[var(--text-1)]">{title}</h2>
			<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
				{children}
			</div>
		</div>
	);
}

// ─── General Settings ───

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
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">常规</h1>

			<SettingSection title="工作区">
				<SettingRow
					title="工作目录"
					description="新建项目时将在此目录下创建对应的项目文件夹"
					border={false}
				>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => void handleSelectWorkspace()}
							className="flex items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 text-[12px] text-[var(--text-1)] transition-colors hover:bg-[var(--surface-overlay)]"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
							<span className="max-w-[180px] truncate">{workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-[var(--text-2)]" />
						</button>
						<button
							type="button"
							onClick={() => void handleResetWorkspace()}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-2)] transition-colors hover:bg-[var(--hover-strong)] hover:text-[var(--text-1)]"
							title="恢复默认"
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>
		</div>
	);
}

// ─── Placeholder pages ───

function ModelsSettings(): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">模型配置</h1>
			<div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 opacity-50">
				<span className="icon-[mdi--brain] h-10 w-10 text-[var(--text-2)]" />
				<p className="text-[13px] text-[var(--text-2)]">即将推出</p>
			</div>
		</div>
	);
}

function McpSettings(): JSX.Element {
	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-[var(--text-1)]">MCP 服务器</h1>
			<div className="flex flex-col items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] py-16 opacity-50">
				<span className="icon-[mdi--server-outline] h-10 w-10 text-[var(--text-2)]" />
				<p className="text-[13px] text-[var(--text-2)]">即将推出</p>
			</div>
		</div>
	);
}

// ─── Settings page shell ───

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
									: "text-[var(--text-1)] hover:bg-[var(--hover)]",
							)}
						>
							<span className={cn(icon, "h-4 w-4 shrink-0")} />
							{label}
						</button>
					))}
				</nav>
			</div>

			{/* Settings content */}
			<div className="flex flex-1 flex-col overflow-y-auto bg-[var(--content-bg)]">
				{/* Drag region */}
				<div className="drag-region h-12 shrink-0" />
				<Content />
			</div>
		</div>
	);
}
