import { forwardRef, useImperativeHandle } from "react";
import type { PluginsPanelHandle } from "../hooks/useSkillsPageModel";
import { usePluginsPanelModel } from "../hooks/usePluginsPanelModel";
import { PluginsPanelView } from "./PluginsPanelView";

export const PluginsPanel = forwardRef<PluginsPanelHandle>(function PluginsPanel(_props, ref): JSX.Element {
	const model = usePluginsPanelModel();

	useImperativeHandle(ref, () => ({ triggerImport: () => model.fileInputRef.current?.click() }), [model.fileInputRef]);

	return <PluginsPanelView model={model} />;
});
