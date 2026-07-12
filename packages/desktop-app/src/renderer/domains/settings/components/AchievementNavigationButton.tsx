import { Button } from "@shared/components/ui/button";
import { AchievementNavigationButtonView } from "@vetta/theme-ui/settings";
import { ACHIEVEMENT_UI_ASSETS } from "../achievement-ui-assets";

interface AchievementNavigationButtonProps {
	disabled: boolean;
	direction: "previous" | "next";
	label: string;
	onClick: () => void;
}

export function AchievementNavigationButton({
	disabled,
	direction,
	label,
	onClick,
}: AchievementNavigationButtonProps): JSX.Element {
	return (
		<AchievementNavigationButtonView
			disabled={disabled}
			direction={direction}
			label={label}
			onClick={onClick}
			assets={ACHIEVEMENT_UI_ASSETS.navigation}
			renderControl={({ disabled: d, label: l, onClick: oc, className, style, children }) => (
				<Button
					variant="ghost"
					disabled={d}
					aria-label={l}
					title={l}
					className={className}
					style={style}
					onClick={oc}
				>
					{children}
				</Button>
			)}
		/>
	);
}
