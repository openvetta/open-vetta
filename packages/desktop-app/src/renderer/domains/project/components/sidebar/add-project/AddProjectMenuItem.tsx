import { useTranslation } from "react-i18next";
import type { AddProjectMenuItemModel } from "./types";

interface AddProjectMenuItemProps {
	item: AddProjectMenuItemModel;
}

export function AddProjectMenuItem({ item }: AddProjectMenuItemProps): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<button
			type="button"
			onClick={item.onSelect}
			className="flex w-full items-center gap-2 px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent/50"
		>
			<span className={`${item.icon} h-3.5 w-3.5 shrink-0`} />
			{t(item.labelKey)}
		</button>
	);
}
