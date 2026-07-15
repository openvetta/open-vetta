import {
	activeInputActionIdsAtom,
	pluginActivityTabsAtom,
	pluginCardRenderersAtom,
	pluginFilePreviewsAtom,
	type PluginI18nEntry,
	pluginI18nByIdAtom,
	pluginInputActionsAtom,
	pluginToolCallSlotsAtom,
	pluginTurnCardsAtom,
	type RegisteredActivityTab,
	type RegisteredCardRenderer,
	type RegisteredFilePreview,
	type RegisteredInputAction,
	type RegisteredToolCallSlot,
	type RegisteredTurnCard,
	syncHardIsolationContributionModes,
} from "@shared/store/atoms";
import { getDefaultStore, useSetAtom } from "jotai";
import { Component, useEffect, useMemo, useReducer, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import type { PluginGlobalSlotContribution } from "@vetta-org/plugin-sdk";
import { markPluginHostLoading, markPluginHostReady, PLUGINS_CHANGED_EVENT } from "../runtime/plugin-events";
import { installPluginHostBridge } from "../runtime/plugin-host-bridge";
import { installPluginHostShim } from "../runtime/plugin-host-shim";
import { PluginI18nBoundary } from "../runtime/plugin-i18n";
import { loadPlugin, type LoadedPlugin } from "../runtime/plugin-loader";

// React effect 重启时，必须先停用上一轮插件，再激活下一轮；插件定义本身可能被模块缓存复用。
let pluginHostLifecycle = Promise.resolve();

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
	/** True while remotes are (re)loading — keep last published contributions to avoid tab flash. */
	const [hostLoading, setHostLoading] = useState(true);
	const setFilePreviews = useSetAtom(pluginFilePreviewsAtom);
	const setActivityTabs = useSetAtom(pluginActivityTabsAtom);
	const setInputActions = useSetAtom(pluginInputActionsAtom);
	const setCardRenderers = useSetAtom(pluginCardRenderersAtom);
	const setToolCallSlots = useSetAtom(pluginToolCallSlotsAtom);
	const setTurnCards = useSetAtom(pluginTurnCardsAtom);
	const setPluginI18n = useSetAtom(pluginI18nByIdAtom);

	useEffect(() => {
		window.addEventListener(PLUGINS_CHANGED_EVENT, reloadPlugins);
		// Main process install/enable/reload (Action / workbench) → re-load remotes.
		const unsubMain = window.vetta.plugins.onPluginsChanged(reloadPlugins);
		return () => {
			window.removeEventListener(PLUGINS_CHANGED_EVENT, reloadPlugins);
			unsubMain();
		};
	}, [reloadPlugins]);

	useEffect(() => {
		// Synchronous: previous lifecycle dispose can empty contribution arrays and
		// forceUpdate before the new load finishes — hold last published tabs/actions.
		setHostLoading(true);
		let disposed = false;
		let requestCleanup = (): void => {};
		const cleanupRequested = new Promise<void>((resolve) => {
			requestCleanup = resolve;
		});

		const lifecycle = pluginHostLifecycle.then(async () => {
			if (disposed) return;

			installPluginHostShim();
			installPluginHostBridge();
			markPluginHostLoading();

			const loadedPlugins = await window.vetta.plugins
				.list()
				.then(async (installedPlugins) => {
					const loaded = await Promise.all(
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
					return loaded.filter((plugin): plugin is LoadedPlugin => plugin !== undefined);
				})
				.catch((error: Error) => {
					console.error("Failed to initialize plugins", error);
					return [];
				})
				.finally(markPluginHostReady);

			// Atomic replace — do not blank plugins to [] mid-reload (that drops activity tabs
			// and falls active tab back to "file", which can reset panel width via file-tab cleanup).
			if (!disposed) {
				setPlugins(loadedPlugins);
				setHostLoading(false);
			} else {
				await Promise.all(loadedPlugins.map((plugin) => plugin.dispose()));
				return;
			}

			await cleanupRequested;
			await Promise.all(loadedPlugins.map((plugin) => plugin.dispose()));
		});
		pluginHostLifecycle = lifecycle.catch((error: unknown) => {
			console.error("Failed to dispose plugins", error);
		});

		return () => {
			disposed = true;
			requestCleanup();
		};
	}, [reloadRevision]);

	const slots = useMemo<PluginGlobalSlotContribution[]>(
		() => plugins.flatMap((plugin) => plugin.slots),
		[plugins, revision],
	);

	// Publish file-preview registrations so FilePreviewView (a separate subtree)
	// can dispatch by extension. Republished on every plugin/slot revision.
	// While hostLoading, skip empty publishes so dispose/reload does not flash UI.
	useEffect(() => {
		const previews: RegisteredFilePreview[] = plugins.flatMap((plugin) =>
			plugin.filePreviews.map((preview) => ({
				pluginId: plugin.id,
				extensions: preview.extensions,
				component: preview.component,
			})),
		);
		if (previews.length > 0 || !hostLoading) setFilePreviews(previews);
	}, [plugins, revision, hostLoading, setFilePreviews]);

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
				scope_use: tab.scope_use,
			})),
		);
		if (tabs.length > 0 || !hostLoading) setActivityTabs(tabs);
	}, [plugins, revision, hostLoading, setActivityTabs]);

	// Publish input-action toggles (rendered beneath the AI input bar).
	useEffect(() => {
		const actions: RegisteredInputAction[] = plugins.flatMap((plugin) =>
			plugin.inputActions.map((action) => ({
				pluginId: plugin.id,
				actionId: action.id,
				label: action.label,
				icon: action.icon,
				defaultActive: action.defaultActive,
				requiresActiveTool: action.requiresActiveTool,
				scope_use: action.scope_use,
				hardIsolation: action.hardIsolation,
				onToggle: action.onToggle,
				decoratePrompt: action.decoratePrompt,
			})),
		);
		if (actions.length > 0 || !hostLoading) {
			setInputActions(actions);
			// 插件晚于会话恢复加载时，按当前工作集补齐 hardIsolation contribution mode。
			if (actions.length > 0) {
				syncHardIsolationContributionModes(getDefaultStore().get(activeInputActionIdsAtom));
			}
		}
	}, [plugins, revision, hostLoading, setInputActions]);

	// Publish card renderers (keyed by type). The per-message card host resolves
	// each card descriptor's `type` to one of these.
	useEffect(() => {
		const cardRenderers: RegisteredCardRenderer[] = plugins.flatMap((plugin) =>
			plugin.cardRenderers.map((renderer) => ({
				pluginId: plugin.id,
				type: renderer.type,
				component: renderer.component,
				title: renderer.title,
				icon: renderer.icon,
				pendingFor: renderer.pendingFor,
			})),
		);
		if (cardRenderers.length > 0 || !hostLoading) setCardRenderers(cardRenderers);
	}, [plugins, revision, hostLoading, setCardRenderers]);

	// Publish per-plugin i18n catalogs so contribution labels and plugin
	// components (useTranslation) resolve `%key%` against the right catalog.
	useEffect(() => {
		const registry: Record<string, PluginI18nEntry> = {};
		for (const plugin of plugins) {
			registry[plugin.id] = { locales: plugin.locales, defaultLocale: plugin.defaultLocale };
		}
		if (Object.keys(registry).length > 0 || !hostLoading) setPluginI18n(registry);
	}, [plugins, hostLoading, setPluginI18n]);

	// Publish tool-call renderers so transcript tool blocks can be replaced by plugins.
	useEffect(() => {
		const toolCallSlots: RegisteredToolCallSlot[] = plugins.flatMap((plugin) =>
			plugin.toolCallSlots.map((slot) => ({
				pluginId: plugin.id,
				slotId: slot.id,
				toolName: slot.toolName,
				component: slot.component,
			})),
		);
		if (toolCallSlots.length > 0 || !hostLoading) setToolCallSlots(toolCallSlots);
	}, [plugins, revision, hostLoading, setToolCallSlots]);

	// Publish turn cards (message-list footer slot). Not tool-bound — each plugin
	// component owns its own visibility; PluginTurnCardHost renders them.
	useEffect(() => {
		const turnCards: RegisteredTurnCard[] = plugins.flatMap((plugin) =>
			plugin.turnCards.map((card) => ({
				pluginId: plugin.id,
				cardId: card.id,
				component: card.component,
				scope_use: card.scope_use,
			})),
		);
		if (turnCards.length > 0 || !hostLoading) setTurnCards(turnCards);
	}, [plugins, revision, hostLoading, setTurnCards]);

	// Host unmount only: clear published contributions.
	useEffect(() => {
		return () => {
			setFilePreviews([]);
			setActivityTabs([]);
			setInputActions([]);
			setCardRenderers([]);
			setToolCallSlots([]);
			setTurnCards([]);
			setPluginI18n({});
		};
	}, [
		setFilePreviews,
		setActivityTabs,
		setInputActions,
		setCardRenderers,
		setToolCallSlots,
		setTurnCards,
		setPluginI18n,
	]);

	if (slots.length === 0) return null;

	return (
		<div className="contents vetta-plugin-host">
			{slots.map((slot) => {
				const SlotComponent = slot.component;
				const pluginId = slot.id.slice(0, slot.id.indexOf(":"));
				return (
					<PluginSlotErrorBoundary key={slot.id} pluginSlotId={slot.id}>
						<div className="contents vetta-plugin" data-vetta-plugin-slot={slot.id}>
							<PluginI18nBoundary pluginId={pluginId}>
								<SlotComponent />
							</PluginI18nBoundary>
						</div>
					</PluginSlotErrorBoundary>
				);
			})}
		</div>
	);
}
