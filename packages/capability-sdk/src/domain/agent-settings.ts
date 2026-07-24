import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import { parseEmptyInput, parseInputRecord, parseOutputRecord, parseRequiredOutputBoolean } from "./parse-helpers.js";

export interface AgentExperimentalSettings {
	readonly vettaCli: boolean;
	readonly promptPrediction: boolean;
	readonly agentSkills: boolean;
}

export interface AgentExperimentalSettingsUpdate {
	readonly vettaCli?: boolean;
	readonly promptPrediction?: boolean;
	readonly agentSkills?: boolean;
}

const EXPERIMENTAL_SETTING_FIELDS = ["vettaCli", "promptPrediction", "agentSkills"] as const;

function parseExperimentalSettings(value: unknown): AgentExperimentalSettings {
	const settings = parseOutputRecord(value);
	return {
		vettaCli: parseRequiredOutputBoolean(settings, "vettaCli"),
		promptPrediction: parseRequiredOutputBoolean(settings, "promptPrediction"),
		agentSkills: parseRequiredOutputBoolean(settings, "agentSkills"),
	};
}

function parseExperimentalSettingsUpdate(value: unknown): AgentExperimentalSettingsUpdate {
	const input = parseInputRecord(value);
	const unknownField = Object.keys(input).find(
		(field) => !EXPERIMENTAL_SETTING_FIELDS.includes(field as (typeof EXPERIMENTAL_SETTING_FIELDS)[number]),
	);
	if (unknownField !== undefined) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_INPUT,
			`Capability field ${unknownField} is not supported`,
		);
	}
	if (Object.keys(input).length === 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must update one setting");
	}

	const update: {
		vettaCli?: boolean;
		promptPrediction?: boolean;
		agentSkills?: boolean;
	} = {};
	for (const field of EXPERIMENTAL_SETTING_FIELDS) {
		if (!(field in input)) continue;
		const fieldValue = input[field];
		if (typeof fieldValue !== "boolean") {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a boolean`);
		}
		update[field] = fieldValue;
	}
	return update;
}

export const DOMAIN_AGENT_SETTINGS_CAPABILITIES = {
	GET_EXPERIMENTAL: defineCapability<Record<string, never>, AgentExperimentalSettings>({
		id: "cap.domain.vetta.agent-settings.experimental.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseExperimentalSettings,
	}),
	SET_EXPERIMENTAL: defineCapability<AgentExperimentalSettingsUpdate, AgentExperimentalSettings>({
		id: "cap.domain.vetta.agent-settings.experimental.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseExperimentalSettingsUpdate,
		parseOutput: parseExperimentalSettings,
	}),
} as const;
