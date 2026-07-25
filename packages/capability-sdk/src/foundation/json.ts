import { CAPABILITY_ERROR_CODES, CapabilityError } from "../contracts.js";

export type CapabilityJsonValue =
	| null
	| boolean
	| number
	| string
	| CapabilityJsonValue[]
	| { [key: string]: CapabilityJsonValue };

export type CapabilityJsonMap = Record<string, CapabilityJsonValue>;

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
