import { cn } from "@shared/lib/utils";
import { SettingsMenu } from "./settings-menu/SettingsMenu";
import { SpaceSwitcher } from "./SpaceSwitcher";

interface SidebarBottomBarProps {
	className?: string;
	classNames?: {
		settings?: string;
	};
}

export function SidebarBottomBar({ className, classNames }: SidebarBottomBarProps): JSX.Element {
	return (
		<div className={cn("flex min-w-0 items-center gap-1 px-1.5 py-1.5", className)}>
			<SpaceSwitcher />
			<div className={cn("ml-auto shrink-0", classNames?.settings)}>
				<SettingsMenu />
			</div>
		</div>
	);
}
