import { useThemeRegion } from "@shared/theme/module";
import { DefaultSidebar } from "./DefaultSidebar";
import type { SidebarProps, SidebarRegionProps } from "./types";
import { useSidebarModel } from "./useSidebarModel";

export function Sidebar(props: SidebarProps): JSX.Element {
	const model = useSidebarModel(props);
	const ThemeSidebar = useThemeRegion<SidebarRegionProps>("sidebar");
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
