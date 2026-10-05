import { BatchProjectDialogView as ThemeBatchProjectDialogView } from "@vetta-org/theme-ui/batch-tasks";
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
		<ThemeBatchProjectDialogView
			open={open}
			onClose={onClose}
			onSubmit={model.submit}
			canSubmit={model.canSubmit}
			submitting={model.submitting}
			labels={{
				title: t(model.titleKey),
				cancel: t("dialog.cancel"),
				submit: model.submitting
					? t(model.submitLabelKey === "dialog.save" ? "dialog.saving" : "dialog.creating")
					: t(model.submitLabelKey),
			}}
			form={
				<>
					{model.error && (
						<p role="alert" className="mb-4 break-words text-[12px] text-destructive">
							{model.error}
						</p>
					)}
					<fieldset disabled={model.submitting} className="min-w-0">
						<BatchProjectFormFields
							value={model.data}
							onChange={model.setData}
							namePlaceholder={t(model.namePlaceholderKey)}
						/>
					</fieldset>
				</>
			}
		/>
	);
}
