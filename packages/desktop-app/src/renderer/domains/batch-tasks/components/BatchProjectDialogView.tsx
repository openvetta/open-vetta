import { Button } from "@shared/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
import { useTranslation } from "react-i18next";
import type { BatchProjectDialogModel } from "../hooks/useBatchProjectDialogModel";
import { BatchProjectFormFields } from "./BatchProjectFormFields";

export interface BatchProjectDialogViewProps {
	model: BatchProjectDialogModel;
	open: boolean;
	onClose: () => void;
}

export function BatchProjectDialogView({ model, open, onClose }: BatchProjectDialogViewProps): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<Dialog open={open} onOpenChange={(value) => !value && onClose()}>
			<DialogContent
				className="flex max-h-[82vh] flex-col gap-0 overflow-hidden rounded-xl border border-border/60 bg-card/95 p-0 backdrop-blur-md sm:max-w-xl"
				showCloseButton={false}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{t(model.titleKey)}</DialogTitle>
				</DialogHeader>

				<div className="flex-1 overflow-y-auto px-7 pt-6 pb-4">
					<BatchProjectFormFields
						value={model.data}
						onChange={model.setData}
						namePlaceholder={t(model.namePlaceholderKey)}
					/>
				</div>

				<div className="flex items-center justify-end gap-2 border-t border-border/40 px-5 py-3">
					<Button
						variant="ghost"
						onClick={onClose}
						className="h-9 rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
					>
						<span className="icon-[solar--close-circle-linear] h-4 w-4" />
						<span>{t("dialog.cancel")}</span>
					</Button>
					<Button
						onClick={model.submit}
						disabled={!model.canSubmit}
						className="h-9 rounded-lg px-4 text-[13px]"
					>
						<span className="icon-[solar--check-circle-linear] h-4 w-4" />
						<span>{t(model.submitLabelKey)}</span>
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
