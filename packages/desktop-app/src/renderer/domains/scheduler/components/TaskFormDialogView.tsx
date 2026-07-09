import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
} from "@shared/components/ui/dialog";
import type { ScheduledTask } from "@shared/store/atoms";
import { useTranslation } from "react-i18next";
import {
	SchedulerTaskFields,
	type SchedulerTaskDraft,
} from "./SchedulerTaskFields";

export interface TaskFormDialogViewProps {
	readonly canSubmit: boolean;
	readonly data: SchedulerTaskDraft;
	readonly open: boolean;
	readonly task: ScheduledTask | undefined;
	readonly onChange: (value: SchedulerTaskDraft) => void;
	readonly onClose: () => void;
	readonly onSubmit: () => void;
}

export function TaskFormDialogView({
	canSubmit,
	data,
	open,
	task,
	onChange,
	onClose,
	onSubmit,
}: TaskFormDialogViewProps): JSX.Element {
	const { t } = useTranslation("automation");

	return (
		<Dialog open={open} onOpenChange={(value) => !value && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-3xl"
				showCloseButton={false}
			>
				<div className="flex-1 overflow-y-auto px-7 py-6">
					<SchedulerTaskFields
						value={data}
						onChange={onChange}
						namePlaceholder={task ? t("dialog.namePlaceholderEdit") : t("dialog.namePlaceholderNew")}
						showWorkDirSelector={false}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[mdi--close] h-4 w-4" />
						<span>{t("dialog.cancel")}</span>
					</Button>
					<Button
						onClick={onSubmit}
						disabled={!canSubmit}
						className="h-9 rounded-lg bg-primary px-4 text-[13px] text-primary-foreground hover:bg-primary/90"
					>
						<span className="icon-[mdi--check] h-4 w-4" />
						<span>{task ? t("dialog.save") : t("dialog.create")}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
