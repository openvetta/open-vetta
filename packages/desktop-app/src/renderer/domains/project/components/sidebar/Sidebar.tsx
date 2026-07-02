import { useThemeRegion } from "@vetta/theme-sdk";
import { DefaultSidebar } from "./DefaultSidebar";
import type { SidebarProps } from "./types";
import { useSidebarModel } from "./useSidebarModel";

export function Sidebar(props: SidebarProps): JSX.Element {
	const model = useSidebarModel(props);
	const ThemeSidebar = useThemeRegion("sidebar");
	if (ThemeSidebar) {
		return (
			<ThemeSidebar
				classNames={props.classNames}
				model={model}
				onOpenSession={props.onOpenSession}
			/>
		);
	}
	return (
		<DefaultSidebar
			classNames={props.classNames}
			model={model}
			onOpenSession={props.onOpenSession}
		/>
	);
}
