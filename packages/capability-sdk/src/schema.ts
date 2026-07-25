import type { StaticDecode, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { CAPABILITY_ERROR_CODES, CapabilityError } from "./contracts.js";

export interface CapabilityJsonObject {
	readonly [key: string]: CapabilityJsonValue;
}

export type CapabilityJsonValue =
	| boolean
	| number
	| string
	| null
	| CapabilityJsonObject
	| readonly CapabilityJsonValue[];

export type CapabilityJsonSchema = boolean | CapabilityJsonObject;

export interface CapabilitySchema<Value> {
	readonly jsonSchema?: CapabilityJsonSchema;
	readonly parse: (value: unknown) => Value;
}

export interface CapabilityTypeBoxSchemaOptions {
	/** Preserve legacy parser behavior that accepts but removes excess object properties. */
	readonly clean?: boolean;
}

function cloneJsonValue(value: unknown): CapabilityJsonValue {
	if (value === null || typeof value === "boolean" || typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (Array.isArray(value)) return Object.freeze(value.map(cloneJsonValue));
	if (typeof value !== "object") throw new Error("Capability schema must contain JSON-compatible values");

	const result: Record<string, CapabilityJsonValue> = {};
	for (const [key, child] of Object.entries(value)) {
		if (child !== undefined) result[key] = cloneJsonValue(child);
	}
	return Object.freeze(result);
}

function cloneJsonSchema(schema: TSchema): CapabilityJsonSchema {
	const cloned = cloneJsonValue(schema);
	if (typeof cloned === "boolean") return cloned;
	if (Array.isArray(cloned) || typeof cloned !== "object" || cloned === null) {
		throw new Error("Capability schema root must be a JSON Schema object or boolean");
	}
	return cloned as CapabilityJsonObject;
}

function removeUndefinedProperties(value: unknown): void {
	if (Array.isArray(value)) {
		for (const item of value) removeUndefinedProperties(item);
		return;
	}
	if (typeof value !== "object" || value === null) return;

	const record = value as Record<string, unknown>;
	for (const [key, child] of Object.entries(record)) {
		if (child === undefined) Reflect.deleteProperty(record, key);
		else removeUndefinedProperties(child);
	}
}

function cleanCapabilityValue(schema: TSchema, value: unknown): unknown {
	const cloned = Value.Clone(value);
	removeUndefinedProperties(cloned);
	return Value.Clean(schema, cloned);
}

function defineTypeBoxCapabilitySchema<Schema extends TSchema>(
	schema: Schema,
	errorCode: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
	message: string,
	options: CapabilityTypeBoxSchemaOptions,
): CapabilitySchema<StaticDecode<Schema>> {
	return Object.freeze({
		jsonSchema: cloneJsonSchema(schema),
		parse: (value: unknown): StaticDecode<Schema> => {
			try {
				const candidate = options.clean ? cleanCapabilityValue(schema, value) : value;
				return Value.Decode(schema, candidate);
			} catch (cause) {
				throw new CapabilityError(errorCode, message, { cause });
			}
		},
	});
}

/**
 * Defines a JSON-compatible TypeBox input schema. Transform and JavaScript-only
 * TypeBox schemas are intentionally unsupported because Catalog output is JSON Schema.
 */
export function defineCapabilityInputSchema<Schema extends TSchema>(
	schema: Schema,
	options: CapabilityTypeBoxSchemaOptions = {},
): CapabilitySchema<StaticDecode<Schema>> {
	return defineTypeBoxCapabilitySchema(
		schema,
		CAPABILITY_ERROR_CODES.INVALID_INPUT,
		"Capability input validation failed",
		options,
	);
}

/**
 * Defines a JSON-compatible TypeBox output schema. Transform and JavaScript-only
 * TypeBox schemas are intentionally unsupported because Catalog output is JSON Schema.
 */
export function defineCapabilityOutputSchema<Schema extends TSchema>(
	schema: Schema,
	options: CapabilityTypeBoxSchemaOptions = {},
): CapabilitySchema<StaticDecode<Schema>> {
	return defineTypeBoxCapabilitySchema(
		schema,
		CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
		"Capability output validation failed",
		options,
	);
}

/** Represents a command that returns no JSON result payload. */
export function defineCapabilityNoOutputSchema(): CapabilitySchema<undefined> {
	return Object.freeze({
		jsonSchema: false,
		parse: (value: unknown): undefined => {
			if (value !== undefined) {
				throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
			}
			return undefined;
		},
	});
}
