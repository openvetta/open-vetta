import { NewProjectDialog } from "@shared/components/NewProjectDialog";
import { Popover, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import { AddProjectMenuPopover } from "./AddProjectMenuPopover";
import { RemoteProjectPickerDialog } from "./RemoteProjectPickerDialog";
import { AddProjectMenuTrigger } from "./AddProjectMenuTrigger";
import { useAddProjectMenuModel } from "./useAddProjectMenuModel";
import type { AddProjectMenuProps } from "./types";

export function AddProjectMenu({ className, variant = "icon" }: AddProjectMenuProps): JSX.Element {
	const model = useAddProjectMenuModel();

	return (
		<>
			<div className={cn("relative", className)}>
				<Popover open={model.open} onOpenChange={model.setOpen}>
					<PopoverTrigger asChild>
						<AddProjectMenuTrigger open={model.open} variant={variant} />
					</PopoverTrigger>
					<AddProjectMenuPopover items={model.items} open={model.open} variant={variant} />
				</Popover>
			</div>
			{model.showNewProject && (
				<NewProjectDialog
					onConfirm={model.confirmNewProject}
					onCancel={model.closeNewProjectDialog}
					isNameTaken={model.isProjectNameTaken}
				/>
			)}
			{/* 挂在 Popover 外面：Popover 一关就会卸载，对话框会跟着消失。 */}
			{model.showRemotePicker && (
				<RemoteProjectPickerDialog
					onConfirm={model.confirmRemoteProject}
					onCancel={model.closeRemotePicker}
				/>
			)}
		</>
	);
}
