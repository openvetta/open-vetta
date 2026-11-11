import { NewProjectDialog } from "@shared/components/NewProjectDialog";
import { cn } from "@shared/lib/utils";
import { AddProjectSplashDialog } from "./AddProjectSplashDialog";
import { AddProjectMenuTrigger } from "./AddProjectMenuTrigger";
import { GitCloneDialog } from "./GitCloneDialog";
import { RemoteProjectPickerDialog } from "./RemoteProjectPickerDialog";
import type { AddProjectMenuProps } from "./types";
import { useAddProjectMenuModel } from "./useAddProjectMenuModel";

export function AddProjectMenu({ className, variant = "icon" }: AddProjectMenuProps): JSX.Element {
	const model = useAddProjectMenuModel();

	return (
		<>
			<div className={cn("relative", className)}>
				<AddProjectMenuTrigger open={model.open} onClick={() => model.setOpen(true)} variant={variant} />
			</div>
			<AddProjectSplashDialog open={model.open} items={model.items} onClose={() => model.setOpen(false)} />
			{model.showNewProject && (
				<NewProjectDialog
					onConfirm={model.confirmNewProject}
					onCancel={model.closeNewProjectDialog}
					isNameTaken={model.isProjectNameTaken}
				/>
			)}
			{model.showGitClone && <GitCloneDialog onCloned={model.confirmGitClone} onCancel={model.closeGitClone} />}
			{/* 与 Splash 并列而不是嵌在里面：Splash 选完就关，对话框要在它之后继续存在。 */}
			{model.showRemotePicker && (
				<RemoteProjectPickerDialog
					onConfirm={model.confirmRemoteProject}
					onCancel={model.closeRemotePicker}
				/>
			)}
		</>
	);
}
