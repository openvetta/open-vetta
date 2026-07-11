/** Settings tabs that surface AI assist entry points. */
export type SettingsAiAssistTabId =
	| "mcp"
	| "models"
	| "knowledge"
	| "im"
	| "webhook"
	| "appearance"
	| "plugins"
	| "pet"
	| "environment"
	| "shortcuts"
	| "agent";

/** Shared chip: ask the agent what can be configured on this page. */
const WHAT_CAN_YOU_CONFIGURE = "aiAssist.examples.whatCanYouConfigure" as const;

const CATALOG = [
	{
		tabId: "mcp",
		contextLabelKey: "aiAssist.context.mcp",
		defaultIntentKey: "aiAssist.defaultIntent.mcp",
		placeholderKey: "aiAssist.placeholder.mcp",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.mcp.webSearch",
			"aiAssist.examples.mcp.notion",
			"aiAssist.examples.mcp.custom",
		],
	},
	{
		tabId: "models",
		contextLabelKey: "aiAssist.context.models",
		defaultIntentKey: "aiAssist.defaultIntent.models",
		placeholderKey: "aiAssist.placeholder.models",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.models.default",
			"aiAssist.examples.models.provider",
			"aiAssist.examples.models.thinking",
		],
	},
	{
		tabId: "knowledge",
		contextLabelKey: "aiAssist.context.knowledge",
		defaultIntentKey: "aiAssist.defaultIntent.knowledge",
		placeholderKey: "aiAssist.placeholder.knowledge",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.knowledge.enable",
			"aiAssist.examples.knowledge.interval",
			"aiAssist.examples.knowledge.model",
		],
	},
	{
		tabId: "im",
		contextLabelKey: "aiAssist.context.im",
		defaultIntentKey: "aiAssist.defaultIntent.im",
		placeholderKey: "aiAssist.placeholder.im",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.im.enable",
			"aiAssist.examples.im.feishu",
			"aiAssist.examples.im.model",
		],
	},
	{
		tabId: "webhook",
		contextLabelKey: "aiAssist.context.webhook",
		defaultIntentKey: "aiAssist.defaultIntent.webhook",
		placeholderKey: "aiAssist.placeholder.webhook",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.webhook.add",
			"aiAssist.examples.webhook.taskDone",
			"aiAssist.examples.webhook.disable",
		],
	},
	{
		tabId: "appearance",
		contextLabelKey: "aiAssist.context.appearance",
		defaultIntentKey: "aiAssist.defaultIntent.appearance",
		placeholderKey: "aiAssist.placeholder.appearance",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.appearance.dark",
			"aiAssist.examples.appearance.theme",
			"aiAssist.examples.appearance.cursor",
		],
	},
	{
		tabId: "plugins",
		contextLabelKey: "aiAssist.context.plugins",
		defaultIntentKey: "aiAssist.defaultIntent.plugins",
		placeholderKey: "aiAssist.placeholder.plugins",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.plugins.list",
			"aiAssist.examples.plugins.configure",
			"aiAssist.examples.plugins.enable",
		],
	},
	{
		tabId: "pet",
		contextLabelKey: "aiAssist.context.pet",
		defaultIntentKey: "aiAssist.defaultIntent.pet",
		placeholderKey: "aiAssist.placeholder.pet",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.pet.show",
			"aiAssist.examples.pet.size",
			"aiAssist.examples.pet.bubble",
		],
	},
	{
		tabId: "environment",
		contextLabelKey: "aiAssist.context.environment",
		defaultIntentKey: "aiAssist.defaultIntent.environment",
		placeholderKey: "aiAssist.placeholder.environment",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.environment.status",
			"aiAssist.examples.environment.reinstall",
			"aiAssist.examples.environment.mirrors",
		],
	},
	{
		tabId: "shortcuts",
		contextLabelKey: "aiAssist.context.shortcuts",
		defaultIntentKey: "aiAssist.defaultIntent.shortcuts",
		placeholderKey: "aiAssist.placeholder.shortcuts",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.shortcuts.list",
			"aiAssist.examples.shortcuts.quickpanel",
			"aiAssist.examples.shortcuts.reset",
		],
	},
	{
		tabId: "agent",
		contextLabelKey: "aiAssist.context.agent",
		defaultIntentKey: "aiAssist.defaultIntent.agent",
		placeholderKey: "aiAssist.placeholder.agent",
		exampleKeys: [
			WHAT_CAN_YOU_CONFIGURE,
			"aiAssist.examples.agent.persona",
			"aiAssist.examples.agent.instructions",
			"aiAssist.examples.agent.images",
		],
	},
] as const satisfies readonly {
	tabId: SettingsAiAssistTabId;
	contextLabelKey: string;
	defaultIntentKey: string;
	placeholderKey: string;
	exampleKeys: readonly string[];
}[];

export type SettingsAiAssistCatalogEntry = (typeof CATALOG)[number];

const BY_TAB = new Map(CATALOG.map((entry) => [entry.tabId, entry]));

export function getSettingsAiAssistEntry(tabId: SettingsAiAssistTabId): SettingsAiAssistCatalogEntry | undefined {
	return BY_TAB.get(tabId);
}
