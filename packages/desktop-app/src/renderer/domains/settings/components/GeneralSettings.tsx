import { useAtom, useSetAtom } from "jotai";
import { useCallback } from "react";
import { workspacePathAtom, debugModeAtom, confirmDialogAtom } from "@shared/store/atoms";
import { UpdateChecker } from "@shared/components/UpdateChecker";
import { Switch } from "@shared/components/ui/switch";
import { SettingRow, SettingSection } from "./shared";

export function GeneralSettings(): JSX.Element {
	const [workspacePath, setWorkspacePath] = useAtom(workspacePathAtom);
	const [debugMode, setDebugMode] = useAtom(debugModeAtom);
	const setConfirmDialog = useSetAtom(confirmDialogAtom);

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
					border={false}
				>
					<Switch checked={debugMode} onCheckedChange={handleToggleDebug} />
				</SettingRow>
			</SettingSection>
		</div>
	);
}
