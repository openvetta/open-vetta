import { DefaultSidebar } from "./DefaultSidebar";
import type { SidebarProps } from "./types";
import { useSidebarModel } from "./useSidebarModel";

export function Sidebar(props: SidebarProps): JSX.Element {
	const model = useSidebarModel(props);
	return (
		<DefaultSidebar
			classNames={props.classNames}
			model={model}
			onOpenSession={props.onOpenSession}
		/>
	);
}
