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

export function parseOptionalInputString(input: Record<string, unknown>, field: string): string | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredInputString(input, field);
}

export function parseRequiredOutputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a string`);
	}
	return value;
}

export function parseOptionalOutputString(input: Record<string, unknown>, field: string): string | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredOutputString(input, field);
}

export function parseRequiredOutputNumber(input: Record<string, unknown>, field: string): number {
	const value = input[field];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a number`);
	}
	return value;
}

export function parseOptionalOutputNumber(input: Record<string, unknown>, field: string): number | undefined {
	const value = input[field];
	if (value === undefined) return undefined;
	return parseRequiredOutputNumber(input, field);
}

export function parseRequiredInputBoolean(input: Record<string, unknown>, field: string): boolean {
	const value = input[field];
	if (typeof value !== "boolean") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a boolean`);
	}
	return value;
}

export function parseRequiredOutputBoolean(input: Record<string, unknown>, field: string): boolean {
	const value = input[field];
	if (typeof value !== "boolean") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a boolean`);
	}
	return value;
}

export function parseEmptyInput(value: unknown): Record<string, never> {
	const input = parseInputRecord(value);
	if (Object.keys(input).length > 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Capability input must be empty");
	}
	return {};
}

export function parseVoidOutput(value: unknown): undefined {
	if (value !== undefined) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
	}
	return undefined;
}
