import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";

export interface SettingsAiAssistButtonProps {
	className?: string;
	onClick: () => void;
}

export function SettingsAiAssistButton({ className, onClick }: SettingsAiAssistButtonProps): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<Button type="button" variant="outline" size="sm" className={cn("shrink-0", className)} onClick={onClick}>
			<span className="icon-[mdi--robot-outline] h-3.5 w-3.5" />
			{t("aiAssist.cta")}
		</Button>
	);
}
