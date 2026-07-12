import type { ComponentType, JSX } from "react";

export interface PluginFilePreviewViewProps<TFile = unknown> {
	file: TFile;
	component: ComponentType<{ file: TFile }>;
}

/**
 * Thin host shell for a plugin-contributed file preview component.
 */
export function PluginFilePreviewView<TFile = unknown>({
	file,
	component: Component,
}: PluginFilePreviewViewProps<TFile>): JSX.Element {
	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<Component file={file} />
		</div>
	);
}
