import { Switch } from "@shared/components/ui/switch";
import { useTranslation } from "react-i18next";

export function BatchProjectNotificationField({
	checked,
	onChange,
}: {
	checked: boolean;
	onChange: (checked: boolean) => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<div className="flex items-start justify-between gap-4 rounded-md border border-border bg-muted/30 px-3 py-2.5">
			<div className="min-w-0">
				<div className="text-sm font-medium text-foreground">{t("form.notifyTitle")}</div>
				<div className="mt-0.5 text-xs text-muted-foreground/80">{t("form.notifyDesc")}</div>
			</div>
			<Switch checked={checked} onCheckedChange={onChange} />
		</div>
	);
}
