import { DefaultSidebar } from "./DefaultSidebar";
import type { SidebarProps } from "./types";
import { useSidebarModel } from "./useSidebarModel";

export function Sidebar(props: SidebarProps): JSX.Element {
	const model = useSidebarModel(props);
	return <DefaultSidebar model={model} onOpenSession={props.onOpenSession} />;
}
