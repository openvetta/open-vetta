import { Textarea } from "@shared/components/ui/textarea";
import { useTranslation } from "react-i18next";
import { compactLines } from "../../utils/batchProjectFormData";

export function BatchProjectArtifactField({
	value,
	onChange,
}: {
	value: string;
	onChange: (patterns: string[]) => void;
}): JSX.Element {
	const { t } = useTranslation("batch-tasks");

	return (
		<div>
			<label className="mb-2 flex items-center justify-between text-sm font-medium text-foreground">
				<span>{t("form.artifact")}</span>
				<span className="text-xs font-normal text-muted-foreground/60">{t("form.optional")}</span>
			</label>
			<Textarea
				value={value}
				onChange={(event) => onChange(compactLines(event.target.value.split(/\r?\n/)))}
				className="min-h-[72px] text-sm"
				placeholder={t("form.artifactPlaceholder")}
			/>
			<p className="mt-2 text-xs text-muted-foreground/60">{t("form.artifactHint")}</p>
		</div>
	);
}
