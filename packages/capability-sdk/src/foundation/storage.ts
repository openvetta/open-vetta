import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	type CapabilityJsonMap,
	type CapabilityJsonValue,
	parseCapabilityJsonMap,
	parseCapabilityJsonValue,
} from "./json.js";
import {
	parseInputRecord,
	parseNullableOutputString,
	parseOutputRecord,
	parseOutputStrings,
	parseRequiredInputString,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

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

export interface StorageJsonReadInput extends StorageGetAllInput {
	readonly key: string;
}

export interface StorageJsonWriteInput extends StorageJsonReadInput {
	readonly value: CapabilityJsonValue;
}

export interface StorageListInput extends StorageGetAllInput {
	readonly prefix?: string;
}

export interface StorageFileReadInput extends StorageGetAllInput {
	readonly path: string;
}

export interface StorageFileWriteInput extends StorageFileReadInput {
	readonly data: string;
}

export interface StorageBlobWrite {
	readonly id?: string;
	readonly data: string;
	readonly mimeType: string;
}

export interface StorageBlobPutInput extends StorageGetAllInput {
	readonly blob: StorageBlobWrite;
}

export interface StorageBlobReadInput extends StorageGetAllInput {
	readonly id: string;
}

export interface StorageBlobRef {
	readonly id: string;
	readonly url: string;
	readonly mimeType: string;
}

export interface StorageBlob {
	readonly data: string;
	readonly mimeType: string;
}

const STORAGE_NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

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
	const input = parseInputRecord(value);
	return { namespace: parseNamespace(input.namespace) };
}

function parseSetInput(value: unknown): StorageSetInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseKey(input.key),
		value: parseCapabilityJsonValue(input.value),
	};
}

function parseRemoveInput(value: unknown): StorageRemoveInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseKey(input.key),
	};
}

function parseStorageJsonReadInput(value: unknown): StorageJsonReadInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseRequiredInputString(input, "key"),
	};
}

function parseStorageJsonWriteInput(value: unknown): StorageJsonWriteInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseRequiredInputString(input, "key"),
		value: parseCapabilityJsonValue(input.value),
	};
}

function parseStorageListInput(value: unknown): StorageListInput {
	const input = parseInputRecord(value);
	const prefix = input.prefix;
	if (prefix !== undefined && (typeof prefix !== "string" || prefix.length === 0)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Storage prefix must be a non-empty string");
	}
	return {
		namespace: parseNamespace(input.namespace),
		...(prefix === undefined ? {} : { prefix }),
	};
}

function parseStorageFileReadInput(value: unknown): StorageFileReadInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		path: parseRequiredInputString(input, "path"),
	};
}

function parseStorageFileWriteInput(value: unknown): StorageFileWriteInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		path: parseRequiredInputString(input, "path"),
		data: parseRequiredInputString(input, "data"),
	};
}

function parseStorageBlobWrite(value: unknown): StorageBlobWrite {
	const input = parseInputRecord(value);
	const id = input.id;
	if (id !== undefined && (typeof id !== "string" || id.length === 0)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Storage blob id must be a non-empty string");
	}
	return {
		...(id === undefined ? {} : { id }),
		data: parseRequiredInputString(input, "data"),
		mimeType: parseRequiredInputString(input, "mimeType"),
	};
}

function parseStorageBlobPutInput(value: unknown): StorageBlobPutInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		blob: parseStorageBlobWrite(input.blob),
	};
}

function parseStorageBlobReadInput(value: unknown): StorageBlobReadInput {
	const input = parseInputRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		id: parseRequiredInputString(input, "id"),
	};
}

function parseStorageBlobRef(value: unknown): StorageBlobRef {
	const result = parseOutputRecord(value);
	return {
		id: parseRequiredOutputString(result, "id"),
		url: parseRequiredOutputString(result, "url"),
		mimeType: parseRequiredOutputString(result, "mimeType"),
	};
}

function parseNullableStorageBlobRef(value: unknown): StorageBlobRef | null {
	return value === null ? null : parseStorageBlobRef(value);
}

function parseNullableStorageBlob(value: unknown): StorageBlob | null {
	if (value === null) return null;
	const result = parseOutputRecord(value);
	return {
		data: parseRequiredOutputString(result, "data"),
		mimeType: parseRequiredOutputString(result, "mimeType"),
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
	READ_JSON: defineCapability<StorageJsonReadInput, CapabilityJsonValue>({
		id: "cap.foundation.vetta.storage.read-json",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageJsonReadInput,
		parseOutput: parseCapabilityJsonValue,
	}),
	WRITE_JSON: defineCapability<StorageJsonWriteInput, undefined>({
		id: "cap.foundation.vetta.storage.write-json",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageJsonWriteInput,
		parseOutput: parseVoidOutput,
	}),
	LIST: defineCapability<StorageListInput, string[]>({
		id: "cap.foundation.vetta.storage.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageListInput,
		parseOutput: parseOutputStrings,
	}),
	READ_FILE: defineCapability<StorageFileReadInput, string | null>({
		id: "cap.foundation.vetta.storage.read-file",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageFileReadInput,
		parseOutput: parseNullableOutputString,
	}),
	WRITE_FILE: defineCapability<StorageFileWriteInput, undefined>({
		id: "cap.foundation.vetta.storage.write-file",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageFileWriteInput,
		parseOutput: parseVoidOutput,
	}),
	PUT_BLOB: defineCapability<StorageBlobPutInput, StorageBlobRef>({
		id: "cap.foundation.vetta.storage.put-blob",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageBlobPutInput,
		parseOutput: parseStorageBlobRef,
	}),
	READ_BLOB: defineCapability<StorageBlobReadInput, StorageBlob | null>({
		id: "cap.foundation.vetta.storage.read-blob",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageBlobReadInput,
		parseOutput: parseNullableStorageBlob,
	}),
	GET_BLOB_REF: defineCapability<StorageBlobReadInput, StorageBlobRef | null>({
		id: "cap.foundation.vetta.storage.get-blob-ref",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseStorageBlobReadInput,
		parseOutput: parseNullableStorageBlobRef,
	}),
} as const;
