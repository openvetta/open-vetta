import { useTranslation } from "react-i18next";
import { cn } from "@shared/lib/utils";
import type { AddProjectMenuProps } from "./types";

interface AddProjectMenuTriggerProps {
	onClick: () => void;
	open: boolean;
	variant: NonNullable<AddProjectMenuProps["variant"]>;
}

export function AddProjectMenuTrigger({
	onClick,
	open,
	variant,
}: AddProjectMenuTriggerProps): JSX.Element {
	const { t } = useTranslation("project");

	if (variant === "navItem") {
		return (
			<button
				type="button"
				title={t("actions.newProject")}
				onClick={onClick}
				className={cn(
					"no-drag flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors",
					open ? "bg-accent text-foreground" : "text-foreground hover:bg-accent",
				)}
			>
				<span className="icon-[solar--add-circle-linear] h-4 w-4 shrink-0" />
				{t("actions.newProject")}
			</button>
		);
	}

	return (
		<button
			type="button"
			title={t("actions.newProject")}
			onClick={onClick}
			className={cn(
				"flex items-center justify-center rounded-md p-1.5 text-foreground transition-opacity hover:bg-accent",
				open ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100",
			)}
		>
			<span className="icon-[solar--add-square-outline] h-4 w-4" />
		</button>
	);
}
