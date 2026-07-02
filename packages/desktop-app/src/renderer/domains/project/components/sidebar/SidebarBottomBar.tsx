import { cn } from "@shared/lib/utils";
import { MessageCenter } from "./message-center/MessageCenter";
import { SettingsMenu } from "./settings-menu/SettingsMenu";

interface SidebarBottomBarProps {
	className?: string;
	classNames?: {
		settings?: string;
	};
}

export function SidebarBottomBar({ className, classNames }: SidebarBottomBarProps): JSX.Element {
	return (
		<div className={cn("flex items-center gap-1 px-1.5 py-1.5", className)}>
			<div className={cn("flex-1", classNames?.settings)}>
				<SettingsMenu />
			</div>
			<MessageCenter />
		</div>
	);
}
