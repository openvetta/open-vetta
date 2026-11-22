import { type Static, Type } from "@sinclair/typebox";
import { createCapabilityCatalog } from "../catalog.js";
import { CAPABILITY_LAYERS, defineCapability } from "../contracts.js";
import { defineCapabilityInputSchema, defineCapabilityOutputSchema } from "../schema.js";

const shortcutEmptyInputType = Type.Object({}, { additionalProperties: false });

const shortcutBindingType = Type.Object(
	{
		id: Type.String(),
		defaultShortcut: Type.String(),
		shortcut: Type.String(),
		isDefault: Type.Boolean(),
	},
	{ additionalProperties: false },
);

const shortcutSettingsType = Type.Object(
	{
		bindings: Type.Array(shortcutBindingType),
	},
	{ additionalProperties: false },
);

const shortcutBindingInputType = Type.Object(
	{
		id: Type.String({ pattern: "\\S" }),
		shortcut: Type.String(),
	},
	{ additionalProperties: false },
);

const shortcutActionInputType = Type.Object(
	{
		id: Type.String({ pattern: "\\S" }),
	},
	{ additionalProperties: false },
);

const shortcutBindingsResultType = Type.Object(
	{
		bindings: Type.Array(shortcutBindingType),
	},
	{ additionalProperties: false },
);

const shortcutBindingResetResultType = Type.Object(
	{
		bindings: Type.Array(shortcutBindingType),
		shortcut: Type.String(),
	},
	{ additionalProperties: false },
);

export type ShortcutBinding = Readonly<Static<typeof shortcutBindingType>>;
export type ShortcutSettings = Readonly<Static<typeof shortcutSettingsType>>;
export type ShortcutBindingInput = Readonly<Static<typeof shortcutBindingInputType>>;
export type ShortcutActionInput = Readonly<Static<typeof shortcutActionInputType>>;
export type ShortcutBindingsResult = Readonly<Static<typeof shortcutBindingsResultType>>;
export type ShortcutBindingResetResult = Readonly<Static<typeof shortcutBindingResetResultType>>;

const shortcutEmptyInputSchema = defineCapabilityInputSchema(shortcutEmptyInputType);
const shortcutSettingsOutputSchema = defineCapabilityOutputSchema(shortcutSettingsType, { clean: true });
const shortcutBindingInputSchema = defineCapabilityInputSchema(shortcutBindingInputType, { clean: true });
const shortcutBindingsOutputSchema = defineCapabilityOutputSchema(shortcutBindingsResultType, { clean: true });
const shortcutActionInputSchema = defineCapabilityInputSchema(shortcutActionInputType, { clean: true });
const shortcutBindingResetOutputSchema = defineCapabilityOutputSchema(shortcutBindingResetResultType, { clean: true });
export const DOMAIN_SHORTCUT_CAPABILITIES = {
	GET_SETTINGS: defineCapability<Record<string, never>, ShortcutSettings>({
		id: "cap.domain.vetta.shortcut.settings.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: shortcutEmptyInputSchema,
		output: shortcutSettingsOutputSchema,
	}),
	SET_BINDING: defineCapability<ShortcutBindingInput, ShortcutBindingsResult>({
		id: "cap.domain.vetta.shortcut.binding.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: shortcutBindingInputSchema,
		output: shortcutBindingsOutputSchema,
	}),
	RESET_BINDING: defineCapability<ShortcutActionInput, ShortcutBindingResetResult>({
		id: "cap.domain.vetta.shortcut.binding.reset",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: shortcutActionInputSchema,
		output: shortcutBindingResetOutputSchema,
	}),
	RESET_ALL_BINDINGS: defineCapability<Record<string, never>, ShortcutBindingsResult>({
		id: "cap.domain.vetta.shortcut.binding.reset-all",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		input: shortcutEmptyInputSchema,
		output: shortcutBindingsOutputSchema,
	}),
} as const;

export const DOMAIN_SHORTCUT_CAPABILITY_CATALOG = createCapabilityCatalog(Object.values(DOMAIN_SHORTCUT_CAPABILITIES));
