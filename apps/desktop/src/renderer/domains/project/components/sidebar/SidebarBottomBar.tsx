import { cn } from "@shared/lib/utils";
import { SettingsMenu } from "./settings-menu/SettingsMenu";
import { SidebarUpdateButton } from "./update/SidebarUpdateButton";

interface SidebarBottomBarProps {
	className?: string;
	classNames?: {
		settings?: string;
	};
}

/**
 * 侧栏底栏：左侧用户菜单（昵称过长 truncate），右侧是更新图标（仅更新就绪时显示，shrink-0 不被挤出）。
 */
export function SidebarBottomBar({ className, classNames }: SidebarBottomBarProps): JSX.Element {
	return (
		<div className={cn("flex min-w-0 items-center gap-1 px-1.5 py-1.5", className)}>
			<div className={cn("min-w-0 flex-1", classNames?.settings)}>
				<SettingsMenu />
			</div>
			<div className="shrink-0">
				<SidebarUpdateButton />
			</div>
		</div>
	);
}
