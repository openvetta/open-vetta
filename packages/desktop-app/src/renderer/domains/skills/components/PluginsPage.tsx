import { usePluginsPageModel } from "../hooks/usePluginsPageModel";
import { PluginsPageView } from "./PluginsPageView";

export function PluginsPage(): JSX.Element {
	return <PluginsPageView model={usePluginsPageModel()} />;
}
