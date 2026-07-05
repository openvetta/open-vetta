import { Button } from "@shared/components/ui/button";
import { BackgroundTasksBadge } from "../BackgroundTasksBadge";
import { SandboxGrantsBadge } from "../SandboxGrantsBadge";
import type { ChatViewActions, ChatViewHeaderModel } from "./types";

interface ChatHeaderActionsViewProps {
	actions: ChatViewActions;
	model: ChatViewHeaderModel;
}

export function ChatHeaderActionsView({ actions, model }: ChatHeaderActionsViewProps): JSX.Element {
	return (
		<>
			<BackgroundTasksBadge />
			<SandboxGrantsBadge />
			<Button
				size="icon-xs"
				variant="ghost"
				title={model.exportTitle}
				disabled={model.exportDisabled}
				onClick={actions.openExport}
			>
				<span
					className={
						model.exporting
							? "icon-[mdi--loading] animate-spin text-[14px]"
							: "icon-[solar--square-share-line-linear] text-[14px]"
					}
				/>
			</Button>
			{model.isLastStage ? (
				<Button
					size="sm"
					className="rounded-full bg-emerald-600 hover:bg-emerald-700"
					onClick={actions.openWorkflowComplete}
				>
					<span className="icon-[solar--check-circle-linear] text-[14px]" />
					<span>{model.completeLabel}</span>
				</Button>
			) : null}
			<Button
				size="icon-xs"
				variant="ghost"
				title={model.pinTitle}
				onClick={actions.togglePin}
				className={model.pinned ? "bg-accent text-foreground" : ""}
			>
				<span
					className={`${model.pinned ? "icon-[solar--pin-bold]" : "icon-[solar--pin-linear]"} text-[14px]`}
				/>
			</Button>
			<Button
				size="icon-xs"
				variant="ghost"
				title={model.panelTitle}
				onClick={actions.togglePanel}
				className={model.panelOpen ? "bg-accent text-foreground" : ""}
			>
				<span className="icon-[solar--sidebar-minimalistic-linear] -scale-x-100 text-[14px]" />
			</Button>
		</>
	);
}
