import { useAtom, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { workspacePathAtom, debugModeAtom, confirmDialogAtom, sessionExecutionModeAtom, type SessionExecutionMode } from "@shared/store/atoms";
import { UpdateChecker } from "@shared/components/UpdateChecker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { Switch } from "@shared/components/ui/switch";
import { SettingRow, SettingSection } from "./shared";

export function GeneralSettings(): JSX.Element {
	const [workspacePath, setWorkspacePath] = useAtom(workspacePathAtom);
	const [debugMode, setDebugMode] = useAtom(debugModeAtom);
	const [executionMode, setExecutionMode] = useAtom(sessionExecutionModeAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const mode = config.defaultExecutionMode ?? "full-access";
			setExecutionMode(mode);
			localStorage.setItem("vetta-session-execution-mode", mode);
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(`${platform} 沙盒不可用：${reason}`);
				return;
			}
			setSandboxUnavailableReason(null);
		});
	}, [setExecutionMode]);

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

	const handleToggleDebug = useCallback(
		(checked: boolean) => {
			if (!checked) {
				setConfirmDialog({
					title: "关闭调试模式",
					message: "关闭后将清空所有调试数据（请求历史记录），确定继续？",
					confirmLabel: "确定关闭",
					variant: "danger",
					onConfirm: () => {
						void window.vetta.debug.clearDebugDir();
						setDebugMode(false);
						localStorage.setItem("vetta-debug-mode", "false");
						void window.vetta.config.set({ debugMode: false });
					},
				});
				return;
			}
			setDebugMode(true);
			localStorage.setItem("vetta-debug-mode", "true");
			void window.vetta.config.set({ debugMode: true });
		},
		[setDebugMode, setConfirmDialog],
	);

	const handleExecutionModeChange = useCallback(
		async (mode: SessionExecutionMode) => {
			if (mode === executionMode) return;
			if (mode === "sandbox" && sandboxUnavailableReason) return;
			const previousMode = executionMode;
			setExecutionMode(mode);
			localStorage.setItem("vetta-session-execution-mode", mode);
			try {
				await window.vetta.config.set({ defaultExecutionMode: mode });
			} catch (error) {
				setExecutionMode(previousMode);
				localStorage.setItem("vetta-session-execution-mode", previousMode);
				console.error("[GeneralSettings] failed to switch execution mode:", error);
			}
		},
		[executionMode, sandboxUnavailableReason, setExecutionMode],
	);

	return (
		<div className="mx-auto w-full max-w-[680px] px-8 py-4">
			<h1 className="mb-6 text-[20px] font-bold text-foreground">常规</h1>

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
							className="flex items-center gap-2 rounded-lg border border-input bg-secondary px-3 py-1.5 text-[12px] text-foreground transition-colors hover:bg-accent"
						>
							<span className="icon-[mdi--folder-outline] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
							<span className="max-w-[180px] truncate">{workspacePath}</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 shrink-0 text-muted-foreground" />
						</button>
						<button
							type="button"
							onClick={() => void handleResetWorkspace()}
							className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							title="恢复默认"
						>
							<span className="icon-[mdi--restore] h-3.5 w-3.5" />
						</button>
					</div>
				</SettingRow>
			</SettingSection>

			<SettingSection title="版本更新">
				<div className="px-5 py-4">
					<UpdateChecker />
				</div>
			</SettingSection>

			<SettingSection title="开发者">
				<SettingRow
					title="调试模式"
					description="打开调试模式，可以协助开发者定位问题"
				>
					<Switch checked={debugMode} onCheckedChange={handleToggleDebug} />
				</SettingRow>
				<SettingRow
					title="默认沙盒状态"
					description="新建会话未单独设置时使用的工具访问范围；不会改变已打开会话"
					border={false}
				>
					<Select value={executionMode} onValueChange={(value) => void handleExecutionModeChange(value as SessionExecutionMode)}>
						<SelectTrigger
							size="sm"
							className="h-8 min-w-[120px] border-border/70 bg-background/50 text-[12px]"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="full-access" className="text-[12px]">
								完全访问
							</SelectItem>
							<SelectItem value="sandbox" className="text-[12px]" disabled={Boolean(sandboxUnavailableReason)} title={sandboxUnavailableReason ?? undefined}>
								使用沙盒
							</SelectItem>
						</SelectContent>
					</Select>
				</SettingRow>
			</SettingSection>
		</div>
	);
}
