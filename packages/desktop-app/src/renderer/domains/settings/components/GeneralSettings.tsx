import { useAtom } from "jotai";
import { useCallback } from "react";
import { workspacePathAtom } from "@shared/store/atoms";
import { UpdateChecker } from "@shared/components/UpdateChecker";
import { SettingRow, SettingSection } from "./shared";

export function GeneralSettings(): JSX.Element {
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
		</div>
	);
}
