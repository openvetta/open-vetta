import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputString,
} from "./parse-helpers.js";

export const QUICK_PANEL_TRIGGERS = {
	NONE: "none",
	MOD: "mod",
	ALT: "alt",
	SHIFT: "shift",
} as const;

export const QUICK_PANEL_POST_SEND_BEHAVIORS = {
	FOREGROUND: "foreground",
	BACKGROUND: "background",
} as const;

export type QuickPanelTrigger = (typeof QUICK_PANEL_TRIGGERS)[keyof typeof QUICK_PANEL_TRIGGERS];
export type QuickPanelPostSendBehavior =
	(typeof QUICK_PANEL_POST_SEND_BEHAVIORS)[keyof typeof QUICK_PANEL_POST_SEND_BEHAVIORS];

export interface ShortcutBinding {
	readonly id: string;
	readonly defaultShortcut: string;
	readonly shortcut: string;
	readonly isDefault: boolean;
}

export interface QuickPanelSettings {
	readonly trigger: QuickPanelTrigger;
	readonly postSendBehavior: QuickPanelPostSendBehavior;
}

export interface ShortcutSettings {
	readonly bindings: ShortcutBinding[];
	readonly quickPanel: QuickPanelSettings;
}

export interface ShortcutBindingInput {
	readonly id: string;
	readonly shortcut: string;
}

export interface ShortcutActionInput {
	readonly id: string;
}

export interface ShortcutBindingsResult {
	readonly bindings: ShortcutBinding[];
}

export interface ShortcutBindingResetResult extends ShortcutBindingsResult {
	readonly shortcut: string;
}

export interface QuickPanelTriggerInput {
	readonly trigger: QuickPanelTrigger;
}

export interface QuickPanelPostSendBehaviorInput {
	readonly behavior: QuickPanelPostSendBehavior;
}

function parseEnumInput<Value extends string>(value: unknown, values: readonly Value[], field: string): Value {
	if (typeof value !== "string" || !values.includes(value as Value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} is invalid`);
	}
	return value as Value;
}

function parseEnumOutput<Value extends string>(value: unknown, values: readonly Value[], field: string): Value {
	if (typeof value !== "string" || !values.includes(value as Value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} is invalid`);
	}
	return value as Value;
}

function parseShortcutBinding(value: unknown): ShortcutBinding {
	const binding = parseOutputRecord(value);
	return {
		id: parseRequiredOutputString(binding, "id"),
		defaultShortcut: parseRequiredOutputString(binding, "defaultShortcut"),
		shortcut: parseRequiredOutputString(binding, "shortcut"),
		isDefault: parseRequiredOutputBoolean(binding, "isDefault"),
	};
}

function parseShortcutBindings(value: unknown): ShortcutBinding[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability bindings must be an array");
	}
	return value.map(parseShortcutBinding);
}

function parseQuickPanelSettings(value: unknown): QuickPanelSettings {
	const settings = parseOutputRecord(value);
	return {
		trigger: parseEnumOutput(settings.trigger, Object.values(QUICK_PANEL_TRIGGERS), "quickPanel.trigger"),
		postSendBehavior: parseEnumOutput(
			settings.postSendBehavior,
			Object.values(QUICK_PANEL_POST_SEND_BEHAVIORS),
			"quickPanel.postSendBehavior",
		),
	};
}

function parseShortcutSettings(value: unknown): ShortcutSettings {
	const settings = parseOutputRecord(value);
	return {
		bindings: parseShortcutBindings(settings.bindings),
		quickPanel: parseQuickPanelSettings(settings.quickPanel),
	};
}

function parseShortcutBindingInput(value: unknown): ShortcutBindingInput {
	const input = parseInputRecord(value);
	if (typeof input.shortcut !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability field shortcut must be a string");
	}
	return {
		id: parseRequiredInputString(input, "id"),
		shortcut: input.shortcut,
	};
}

function parseShortcutActionInput(value: unknown): ShortcutActionInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id") };
}

function parseShortcutBindingsResult(value: unknown): ShortcutBindingsResult {
	const result = parseOutputRecord(value);
	return { bindings: parseShortcutBindings(result.bindings) };
}

function parseShortcutBindingResetResult(value: unknown): ShortcutBindingResetResult {
	const result = parseOutputRecord(value);
	return {
		bindings: parseShortcutBindings(result.bindings),
		shortcut: parseRequiredOutputString(result, "shortcut"),
	};
}

function parseQuickPanelTriggerInput(value: unknown): QuickPanelTriggerInput {
	const input = parseInputRecord(value);
	return {
		trigger: parseEnumInput(input.trigger, Object.values(QUICK_PANEL_TRIGGERS), "trigger"),
	};
}

function parseQuickPanelPostSendBehaviorInput(value: unknown): QuickPanelPostSendBehaviorInput {
	const input = parseInputRecord(value);
	return {
		behavior: parseEnumInput(input.behavior, Object.values(QUICK_PANEL_POST_SEND_BEHAVIORS), "behavior"),
	};
}

export const DOMAIN_SHORTCUT_CAPABILITIES = {
	GET_SETTINGS: defineCapability<Record<string, never>, ShortcutSettings>({
		id: "cap.domain.vetta.shortcut.settings.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseShortcutSettings,
	}),
	SET_BINDING: defineCapability<ShortcutBindingInput, ShortcutBindingsResult>({
		id: "cap.domain.vetta.shortcut.binding.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseShortcutBindingInput,
		parseOutput: parseShortcutBindingsResult,
	}),
	RESET_BINDING: defineCapability<ShortcutActionInput, ShortcutBindingResetResult>({
		id: "cap.domain.vetta.shortcut.binding.reset",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseShortcutActionInput,
		parseOutput: parseShortcutBindingResetResult,
	}),
	RESET_ALL_BINDINGS: defineCapability<Record<string, never>, ShortcutBindingsResult>({
		id: "cap.domain.vetta.shortcut.binding.reset-all",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseShortcutBindingsResult,
	}),
} as const;

export const DOMAIN_QUICK_PANEL_CAPABILITIES = {
	SET_TRIGGER: defineCapability<QuickPanelTriggerInput, QuickPanelSettings>({
		id: "cap.domain.vetta.quick-panel.trigger.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseQuickPanelTriggerInput,
		parseOutput: parseQuickPanelSettings,
	}),
	SET_POST_SEND_BEHAVIOR: defineCapability<QuickPanelPostSendBehaviorInput, QuickPanelSettings>({
		id: "cap.domain.vetta.quick-panel.post-send-behavior.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseQuickPanelPostSendBehaviorInput,
		parseOutput: parseQuickPanelSettings,
	}),
} as const;
