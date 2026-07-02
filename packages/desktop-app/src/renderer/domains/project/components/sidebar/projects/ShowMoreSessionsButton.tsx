import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";

interface ShowMoreSessionsButtonProps {
	hiddenCount: number;
	onClick: () => void;
	showAll: boolean;
}

export function ShowMoreSessionsButton({
	hiddenCount,
	onClick,
	showAll,
}: ShowMoreSessionsButtonProps): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<button
			type="button"
			onClick={onClick}
			className="flex w-full items-center gap-1 rounded-lg px-2.5 py-[6px] pl-[36px] text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
		>
			<span
				className={cn(
					showAll ? "icon-[solar--alt-arrow-up-linear]" : "icon-[solar--alt-arrow-down-linear]",
					"h-3.5 w-3.5 shrink-0",
				)}
			/>
			{showAll
				? t("sidebar.projects.collapseSessions")
				: t("sidebar.projects.expandMore", { count: hiddenCount })}
		</button>
	);
}
