import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@vetta/ui";
import { useTranslation } from "react-i18next";

export function AddCapabilityMenu({
	importing,
	onImportSkill,
	onAddConnector,
}: {
	importing: boolean;
	onImportSkill: () => void;
	onAddConnector: () => void;
}): JSX.Element {
	const { t } = useTranslation("skills");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button type="button" variant="outline">
					<span className="icon-[solar--add-circle-linear] h-3.5 w-3.5" />
					<span>{t("capabilities.add.trigger")}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 text-muted-foreground/60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-72">
				<DropdownMenuLabel>{t("capabilities.add.title")}</DropdownMenuLabel>
				<DropdownMenuItem disabled={importing} onSelect={onImportSkill} className="items-start gap-2.5 py-2.5">
					<span
						className={`mt-0.5 h-4 w-4 shrink-0 ${
							importing ? "icon-[solar--refresh-linear] animate-spin" : "icon-[solar--archive-up-linear]"
						}`}
					/>
					<span className="min-w-0">
						<span className="block text-[13px] font-medium">{t("capabilities.add.importSkill")}</span>
						<span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground/70">
							{t("capabilities.add.importSkillHint")}
						</span>
					</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={onAddConnector} className="items-start gap-2.5 py-2.5">
					<span className="icon-[solar--server-square-cloud-linear] mt-0.5 h-4 w-4 shrink-0" />
					<span className="min-w-0">
						<span className="block text-[13px] font-medium">{t("capabilities.add.addConnector")}</span>
						<span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground/70">
							{t("capabilities.add.addConnectorHint")}
						</span>
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
