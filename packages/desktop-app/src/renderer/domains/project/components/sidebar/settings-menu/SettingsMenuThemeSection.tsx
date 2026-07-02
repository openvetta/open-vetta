import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import type { SettingsMenuModel } from "./types";

interface SettingsMenuThemeSectionProps {
	model: SettingsMenuModel;
}

export function SettingsMenuThemeSection({ model }: SettingsMenuThemeSectionProps): JSX.Element {
	const { t } = useTranslation("settings");

	return (
		<div className="flex items-center justify-between gap-2 px-2 pb-1.5 pt-1.5">
			<div className="flex items-center gap-2 text-[12px] font-medium text-foreground">
				<span className="icon-[solar--palette-linear] h-3.5 w-3.5" />
				<span>{t("theme.title")}</span>
			</div>
			<div className="flex items-center gap-0.5 rounded-md bg-accent/60 p-0.5">
				{model.themeOptions.map((option) => (
					<button
						key={option.value}
						type="button"
						title={option.label}
						aria-label={option.label}
						aria-pressed={model.mode === option.value}
						onClick={(event) => model.actions.setMode(option.value, event)}
						className={cn(
							"flex h-5 w-6 items-center justify-center rounded-[4px] transition-colors",
							model.mode === option.value
								? "bg-primary text-primary-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<span className={cn(option.icon, "h-3.5 w-3.5")} />
					</button>
				))}
			</div>
		</div>
	);
}
