import {
	pluginActivityTabsAtom,
	pluginFilePreviewsAtom,
	type RegisteredActivityTab,
	type RegisteredFilePreview,
} from "@shared/store/atoms";
import { useSetAtom } from "jotai";
import { Component, useEffect, useMemo, useReducer, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { PluginGlobalSlotContribution } from "@vetta/plugin-sdk";
import { PLUGINS_CHANGED_EVENT } from "../runtime/plugin-events";
import { installPluginHostBridge } from "../runtime/plugin-host-bridge";
import { installPluginHostShim } from "../runtime/plugin-host-shim";
import { loadPlugin, type LoadedPlugin } from "../runtime/plugin-loader";

class PluginSlotErrorBoundary extends Component<
	{ pluginSlotId: string; children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError(): { failed: boolean } {
		return { failed: true };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		console.error(`Plugin slot failed: ${this.props.pluginSlotId}`, error, errorInfo.componentStack);
	}

	render(): ReactNode {
		if (this.state.failed) return null;
		return this.props.children;
	}
}

export function PluginGlobalSlotHost(): JSX.Element | null {
	const [plugins, setPlugins] = useState<LoadedPlugin[]>([]);
	const [revision, forceUpdate] = useReducer((value: number) => value + 1, 0);
	const [reloadRevision, reloadPlugins] = useReducer((value: number) => value + 1, 0);
	const setFilePreviews = useSetAtom(pluginFilePreviewsAtom);
	const setActivityTabs = useSetAtom(pluginActivityTabsAtom);

	useEffect(() => {
		window.addEventListener(PLUGINS_CHANGED_EVENT, reloadPlugins);
		return () => window.removeEventListener(PLUGINS_CHANGED_EVENT, reloadPlugins);
	}, []);

	useEffect(() => {
		let disposed = false;
		installPluginHostShim();
		installPluginHostBridge();
		setPlugins([]);

		const loadPromise = window.vetta.plugins
			.list()
			.then(async (installedPlugins) => {
				const loadedPlugins = await Promise.all(
					installedPlugins
						.filter((plugin) => plugin.enabled)
						.map(async (plugin) => {
							try {
								return await loadPlugin(plugin, forceUpdate);
							} catch (error) {
								console.error(`Failed to load plugin: ${plugin.id}`, error);
								return undefined;
							}
						}),
				);
				return loadedPlugins.filter((plugin): plugin is LoadedPlugin => plugin !== undefined);
			})
			.catch((error: Error) => {
				console.error("Failed to initialize plugins", error);
				return [];
			});

		void loadPromise.then((loadedPlugins) => {
			if (!disposed) setPlugins(loadedPlugins);
		});

		return () => {
			disposed = true;
			void loadPromise.then((loadedPlugins) => Promise.all(loadedPlugins.map((plugin) => plugin.dispose())));
		};
	}, [reloadRevision]);

	const slots = useMemo<PluginGlobalSlotContribution[]>(
		() => plugins.flatMap((plugin) => plugin.slots),
		[plugins, revision],
	);

	// Publish file-preview registrations so FilePreviewView (a separate subtree)
	// can dispatch by extension. Republished on every plugin/slot revision.
	useEffect(() => {
		const previews: RegisteredFilePreview[] = plugins.flatMap((plugin) =>
			plugin.filePreviews.map((preview) => ({
				pluginId: plugin.id,
				extensions: preview.extensions,
				component: preview.component,
			})),
		);
		setFilePreviews(previews);
		return () => setFilePreviews([]);
	}, [plugins, revision, setFilePreviews]);

	// Publish activity-tab contributions (the addable pool) so ActivityPanel
	// can render attached tabs and the "+" picker.
	useEffect(() => {
		const tabs: RegisteredActivityTab[] = plugins.flatMap((plugin) =>
			plugin.activityTabs.map((tab) => ({
				pluginId: plugin.id,
				pluginName: plugin.name,
				tabId: tab.id,
				label: tab.label,
				icon: tab.icon,
				component: tab.component,
			})),
		);
		setActivityTabs(tabs);
		return () => setActivityTabs([]);
	}, [plugins, revision, setActivityTabs]);

	if (slots.length === 0) return null;

	return (
		<div className="contents vetta-plugin-host">
			{slots.map((slot) => {
				const SlotComponent = slot.component;
				return (
					<PluginSlotErrorBoundary key={slot.id} pluginSlotId={slot.id}>
						<div className="contents vetta-plugin" data-vetta-plugin-slot={slot.id}>
							<SlotComponent />
						</div>
					</PluginSlotErrorBoundary>
				);
			})}
		</div>
	);
}
