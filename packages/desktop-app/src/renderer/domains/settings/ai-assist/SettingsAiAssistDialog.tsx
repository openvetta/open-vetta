import { useTranslation } from "react-i18next";
import { SettingsAiAssistDialogView } from "@vetta/theme-ui/settings";

export interface SettingsAiAssistDialogProps {
	contextLabel: string;
	examples: readonly string[];
	intent: string;
	open: boolean;
	placeholder: string;
	submitting: boolean;
	submitError: string | null;
	onApplyExample: (text: string) => void;
	onIntentChange: (value: string) => void;
	onOpenChange: (open: boolean) => void;
	onSubmit: () => void;
}

export function SettingsAiAssistDialog({
	contextLabel,
	examples,
	intent,
	open,
	placeholder,
	submitting,
	submitError,
	onApplyExample,
	onIntentChange,
	onOpenChange,
	onSubmit,
}: SettingsAiAssistDialogProps): JSX.Element {
	const { t } = useTranslation("settings");
	const { t: tCommon } = useTranslation("common");

	return (
		<SettingsAiAssistDialogView
			open={open}
			onOpenChange={onOpenChange}
			examples={examples}
			intent={intent}
			placeholder={placeholder}
			submitting={submitting}
			submitError={submitError}
			onApplyExample={onApplyExample}
			onIntentChange={onIntentChange}
			onSubmit={onSubmit}
			labels={{
				title: t("aiAssist.dialog.title"),
				description: t("aiAssist.dialog.description", { page: contextLabel }),
				approvalHint: t("aiAssist.dialog.approvalHint"),
				cancel: tCommon("actions.cancel"),
				start: t("aiAssist.dialog.start"),
				starting: t("aiAssist.dialog.starting"),
			}}
		/>
	);
}
