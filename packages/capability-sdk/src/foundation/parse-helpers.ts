import { CAPABILITY_ERROR_CODES, CapabilityError } from "../contracts.js";

export function parseInputRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must be an object");
	}
	return value as Record<string, unknown>;
}

export function parseOutputRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an object");
	}
	return value as Record<string, unknown>;
}

export function parseRequiredInputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

export function parseRequiredOutputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a string`);
	}
	return value;
}

export function parseRequiredOutputNumber(input: Record<string, unknown>, field: string): number {
	const value = input[field];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a number`);
	}
	return value;
}

export function parseNullableOutputString(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be a string or null");
	}
	return value;
}

export function parseOutputStrings(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be a string array");
	}
	return value;
}

export function parseVoidOutput(value: unknown): undefined {
	if (value !== undefined) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
	}
	return undefined;
}
