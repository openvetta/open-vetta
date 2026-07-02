import { useTranslation } from "react-i18next";
import { UserAvatar } from "@shared/components/UserAvatar";
import { cn } from "@shared/lib/utils";
import type { SettingsMenuModel } from "./types";

interface SettingsMenuTriggerProps {
	model: SettingsMenuModel;
}

export function SettingsMenuTrigger({ model }: SettingsMenuTriggerProps): JSX.Element {
	const { t } = useTranslation("settings");
	const userLabel = model.user?.nickname || model.user?.username;

	return (
		<button
			type="button"
			className={cn(
				"no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-[12px] font-medium transition-colors",
				model.open
					? "bg-accent text-foreground"
					: "text-foreground hover:bg-accent/50",
			)}
		>
			{model.user ? (
				<>
					<UserAvatar
						avatar={model.user.avatar}
						nickname={model.user.nickname}
						username={model.user.username}
						className="h-4 w-4 shrink-0"
						textClassName="text-[9px]"
					/>
					<span className="truncate">{userLabel}</span>
					{model.goEnabled && (
						<span
							className="inline-flex shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none text-primary-foreground"
							style={{ backgroundColor: model.goBadgeColor || "var(--primary)" }}
							title={model.subscriptionTierName || "Vetta Go"}
						>
							{model.goBadgeText || model.subscriptionTierName || "Go"}
						</span>
					)}
				</>
			) : (
				<>
					<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
					{t("sidebar.settings")}
				</>
			)}
		</button>
	);
}
