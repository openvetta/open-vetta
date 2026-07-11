import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";
import type { SettingsAiAssistTabId } from "./catalog";
import { SettingsAiAssistButton } from "./SettingsAiAssistButton";
import { SettingsAiAssistDialog } from "./SettingsAiAssistDialog";
import { useSettingsAiAssist } from "./useSettingsAiAssist";

export interface SettingsAiAssistProps {
	tabId: SettingsAiAssistTabId;
	className?: string;
}

/**
 * Settings-page entry: compact CTA + intent dialog → new conversation with a structured starter prompt.
 * Write ops still go through vetta action approval after the agent runs.
 */
export function SettingsAiAssist({ tabId, className }: SettingsAiAssistProps): JSX.Element | null {
	const { t } = useTranslation("settings");
	const model = useSettingsAiAssist(tabId);

	if (!model) return null;

	const contextLabel = t(model.entry.contextLabelKey);
	const examples = model.entry.exampleKeys.map((key) => t(key));
	const placeholder = t(model.entry.placeholderKey);

	return (
		<div className={cn("inline-flex", className)}>
			<SettingsAiAssistButton onClick={model.openDialog} />
			<SettingsAiAssistDialog
				open={model.dialogOpen}
				contextLabel={contextLabel}
				examples={examples}
				intent={model.intent}
				placeholder={placeholder}
				submitting={model.submitting}
				submitError={model.submitError}
				onApplyExample={model.applyExample}
				onIntentChange={model.setIntent}
				onOpenChange={(open) => {
					if (open) model.openDialog();
					else model.closeDialog();
				}}
				onSubmit={() => void model.submit()}
			/>
		</div>
	);
}
