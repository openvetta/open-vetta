import { cn } from "@vetta/ui";
import { useTranslation } from "react-i18next";
import type { SettingsMenuModel } from "./types";

interface SettingsMenuAgentModeSectionProps {
	model: SettingsMenuModel;
}

/**
 * 工作模式切换（agent_mode 轴，见 ADR-0046）。分段控件（Work | Coding），为未来扩展模式留位。
 */
export function SettingsMenuAgentModeSection({ model }: SettingsMenuAgentModeSectionProps): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<div className="px-1.5 py-1">
			<div className="mb-1 px-0.5 text-[10px] font-medium text-muted-foreground">{t("agentMode.title")}</div>
			<div className="flex gap-0.5 rounded-md bg-accent/40 p-0.5">
				{model.agentModeOptions.map((option) => {
					const active = option.value === model.agentMode;
					return (
						<button
							key={option.value}
							type="button"
							className={cn(
								"flex-1 rounded-[5px] px-2 py-1 text-[11px] font-medium transition-colors",
								active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
							)}
							onClick={() => model.actions.setAgentMode(option.value)}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
