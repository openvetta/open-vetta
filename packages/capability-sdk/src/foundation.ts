import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "./contracts.js";

export type CapabilityJsonValue =
	| null
	| boolean
	| number
	| string
	| CapabilityJsonValue[]
	| { [key: string]: CapabilityJsonValue };

export type CapabilityJsonMap = Record<string, CapabilityJsonValue>;

export interface StorageGetAllInput {
	readonly namespace: string;
}

export interface StorageSetInput extends StorageGetAllInput {
	readonly key: string;
	readonly value: CapabilityJsonValue;
}

export interface StorageRemoveInput extends StorageGetAllInput {
	readonly key: string;
}

const STORAGE_NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function parseJsonValueInternal(value: unknown, seen: Set<object>): CapabilityJsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "number") {
		if (Number.isFinite(value)) return value;
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability JSON numbers must be finite");
	}
	if (typeof value !== "object") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability value must be JSON-serializable");
	}
	if (seen.has(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability value must not contain cycles");
	}
	const prototype = Object.getPrototypeOf(value);
	if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Capability JSON objects must use a plain object prototype",
		);
	}
	seen.add(value);
	try {
		if (Array.isArray(value)) return value.map((item) => parseJsonValueInternal(item, seen));
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, parseJsonValueInternal(item, seen)]));
	} finally {
		seen.delete(value);
	}
}

export function parseCapabilityJsonValue(value: unknown): CapabilityJsonValue {
	return parseJsonValueInternal(value, new Set());
}

export function parseCapabilityJsonMap(value: unknown): CapabilityJsonMap {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability result must be a JSON object map");
	}
	const parsed = parseCapabilityJsonValue(value);
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability result must be a JSON object map");
	}
	return parsed;
}

function parseRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must be an object");
	}
	return value as Record<string, unknown>;
}

function parseNamespace(value: unknown): string {
	if (typeof value !== "string" || !STORAGE_NAMESPACE_PATTERN.test(value) || value.includes("..")) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Invalid storage namespace");
	}
	return value;
}

function parseKey(value: unknown): string {
	if (typeof value !== "string" || !STORAGE_KEY_PATTERN.test(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Invalid storage key");
	}
	return value;
}

function parseGetAllInput(value: unknown): StorageGetAllInput {
	const input = parseRecord(value);
	return { namespace: parseNamespace(input.namespace) };
}

function parseSetInput(value: unknown): StorageSetInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseKey(input.key),
		value: parseCapabilityJsonValue(input.value),
	};
}

function parseRemoveInput(value: unknown): StorageRemoveInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseKey(input.key),
	};
}

export const FOUNDATION_STORAGE_CAPABILITIES = {
	GET_ALL: defineCapability<StorageGetAllInput, CapabilityJsonMap>({
		id: "cap.foundation.vetta.storage.get-all",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseGetAllInput,
		parseOutput: parseCapabilityJsonMap,
	}),
	SET: defineCapability<StorageSetInput, CapabilityJsonMap>({
		id: "cap.foundation.vetta.storage.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseSetInput,
		parseOutput: parseCapabilityJsonMap,
	}),
	REMOVE: defineCapability<StorageRemoveInput, CapabilityJsonMap>({
		id: "cap.foundation.vetta.storage.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseRemoveInput,
		parseOutput: parseCapabilityJsonMap,
	}),
	CLEAR: defineCapability<StorageGetAllInput, CapabilityJsonMap>({
		id: "cap.foundation.vetta.storage.clear",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseGetAllInput,
		parseOutput: parseCapabilityJsonMap,
	}),
} as const;
