import { CAPABILITY_LAYERS, defineCapability } from "../contracts.js";
import { type CapabilityJsonValue, parseCapabilityJsonValue } from "./json.js";
import { parseInputRecord } from "./parse-helpers.js";

export interface NetworkRequestInput {
	readonly request: CapabilityJsonValue;
}

function parseNetworkRequestInput(value: unknown): NetworkRequestInput {
	const input = parseInputRecord(value);
	return { request: parseCapabilityJsonValue(input.request) };
}

export const FOUNDATION_NETWORK_CAPABILITIES = {
	REQUEST: defineCapability<NetworkRequestInput, CapabilityJsonValue>({
		id: "cap.foundation.vetta.network.request",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseNetworkRequestInput,
		parseOutput: parseCapabilityJsonValue,
	}),
} as const;
