import { Component, useEffect, useMemo, useReducer, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { PluginGlobalSlotContribution } from "@shared/plugin-sdk";
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

	useEffect(() => {
		let disposed = false;
		const loaded: LoadedPlugin[] = [];
		installPluginHostShim();

		void window.vetta.plugins
			.list()
			.then((installedPlugins) =>
				Promise.all(
					installedPlugins
						.filter((plugin) => plugin.enabled)
						.map(async (plugin) => {
							try {
								const loadedPlugin = await loadPlugin(plugin, forceUpdate);
								loaded.push(loadedPlugin);
							} catch (error) {
								console.error(`Failed to load plugin: ${plugin.id}`, error);
							}
						}),
				),
			)
			.then(() => {
				if (!disposed) setPlugins([...loaded]);
			})
			.catch((error: Error) => {
				console.error("Failed to initialize plugins", error);
			});

		return () => {
			disposed = true;
			void Promise.all(loaded.map((plugin) => plugin.dispose()));
		};
	}, []);

	const slots = useMemo<PluginGlobalSlotContribution[]>(
		() => plugins.flatMap((plugin) => plugin.slots),
		[plugins, revision],
	);

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
