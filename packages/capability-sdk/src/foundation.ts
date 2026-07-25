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

export interface FilesystemPathInput {
	readonly path: string;
}

export interface FilesystemRenameInput {
	readonly oldPath: string;
	readonly newPath: string;
}

export interface FilesystemMoveInput {
	readonly sourcePath: string;
	readonly destinationDirectory: string;
}

export interface FilesystemWriteFileInput extends FilesystemPathInput {
	readonly content: string;
	readonly encoding?: "utf8" | "base64";
}

export interface FilesystemEntry {
	readonly name: string;
	readonly path: string;
	readonly isDirectory: boolean;
	readonly size: number;
	readonly modifiedAt: number;
}

export interface FilesystemFileRef {
	readonly name: string;
	readonly path: string;
	readonly relPath: string;
}

export interface FilesystemReadFileResult {
	readonly content: string;
	readonly encoding: "utf8" | "base64";
}

export interface FilesystemReadBinaryFileResult {
	readonly data: string;
	readonly mimeType: string;
	readonly size: number;
}

export interface FilesystemStatResult {
	readonly size: number;
	readonly modifiedAt: number;
	readonly createdAt: number;
}

export interface NetworkRequestInput {
	readonly request: CapabilityJsonValue;
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

function parseRequiredString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

function parsePathInput(value: unknown): FilesystemPathInput {
	const input = parseRecord(value);
	return { path: parseRequiredString(input, "path") };
}

function parseRenameInput(value: unknown): FilesystemRenameInput {
	const input = parseRecord(value);
	return {
		oldPath: parseRequiredString(input, "oldPath"),
		newPath: parseRequiredString(input, "newPath"),
	};
}

function parseMoveInput(value: unknown): FilesystemMoveInput {
	const input = parseRecord(value);
	return {
		sourcePath: parseRequiredString(input, "sourcePath"),
		destinationDirectory: parseRequiredString(input, "destinationDirectory"),
	};
}

function parseWriteFileInput(value: unknown): FilesystemWriteFileInput {
	const input = parseRecord(value);
	const content = input.content;
	if (typeof content !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Filesystem content must be a string");
	}
	const encoding = input.encoding;
	if (encoding !== undefined && encoding !== "utf8" && encoding !== "base64") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Invalid filesystem encoding");
	}
	return {
		path: parseRequiredString(input, "path"),
		content,
		...(encoding === undefined ? {} : { encoding }),
	};
}

function parseNetworkRequestInput(value: unknown): NetworkRequestInput {
	const input = parseRecord(value);
	return { request: parseCapabilityJsonValue(input.request) };
}

function parseStorageJsonReadInput(value: unknown): StorageJsonReadInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseRequiredString(input, "key"),
	};
}

function parseStorageJsonWriteInput(value: unknown): StorageJsonWriteInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		key: parseRequiredString(input, "key"),
		value: parseCapabilityJsonValue(input.value),
	};
}

function parseStorageListInput(value: unknown): StorageListInput {
	const input = parseRecord(value);
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
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		path: parseRequiredString(input, "path"),
	};
}

function parseStorageFileWriteInput(value: unknown): StorageFileWriteInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		path: parseRequiredString(input, "path"),
		data: parseRequiredString(input, "data"),
	};
}

function parseStorageBlobWrite(value: unknown): StorageBlobWrite {
	const input = parseRecord(value);
	const id = input.id;
	if (id !== undefined && (typeof id !== "string" || id.length === 0)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Storage blob id must be a non-empty string");
	}
	return {
		...(id === undefined ? {} : { id }),
		data: parseRequiredString(input, "data"),
		mimeType: parseRequiredString(input, "mimeType"),
	};
}

function parseStorageBlobPutInput(value: unknown): StorageBlobPutInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		blob: parseStorageBlobWrite(input.blob),
	};
}

function parseStorageBlobReadInput(value: unknown): StorageBlobReadInput {
	const input = parseRecord(value);
	return {
		namespace: parseNamespace(input.namespace),
		id: parseRequiredString(input, "id"),
	};
}

function parseOutputRecord(value: unknown): Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an object");
	}
	return value as Record<string, unknown>;
}

function parseOutputString(input: Record<string, unknown>, field: string): string {
	const value = input[field];
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a string`);
	}
	return value;
}

function parseOutputNumber(input: Record<string, unknown>, field: string): number {
	const value = input[field];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} must be a number`);
	}
	return value;
}

function parseFilesystemEntry(value: unknown): FilesystemEntry {
	const entry = parseOutputRecord(value);
	if (typeof entry.isDirectory !== "boolean") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output isDirectory must be boolean");
	}
	return {
		name: parseOutputString(entry, "name"),
		path: parseOutputString(entry, "path"),
		isDirectory: entry.isDirectory,
		size: parseOutputNumber(entry, "size"),
		modifiedAt: parseOutputNumber(entry, "modifiedAt"),
	};
}

function parseFilesystemEntries(value: unknown): FilesystemEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseFilesystemEntry);
}

function parseFilesystemFileRef(value: unknown): FilesystemFileRef {
	const file = parseOutputRecord(value);
	return {
		name: parseOutputString(file, "name"),
		path: parseOutputString(file, "path"),
		relPath: parseOutputString(file, "relPath"),
	};
}

function parseFilesystemFileRefs(value: unknown): FilesystemFileRef[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseFilesystemFileRef);
}

function parseFilesystemReadFileResult(value: unknown): FilesystemReadFileResult {
	const result = parseOutputRecord(value);
	if (result.encoding !== "utf8" && result.encoding !== "base64") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Invalid filesystem output encoding");
	}
	return {
		content: parseOutputString(result, "content"),
		encoding: result.encoding,
	};
}

function parseFilesystemReadBinaryFileResult(value: unknown): FilesystemReadBinaryFileResult {
	const result = parseOutputRecord(value);
	return {
		data: parseOutputString(result, "data"),
		mimeType: parseOutputString(result, "mimeType"),
		size: parseOutputNumber(result, "size"),
	};
}

function parseFilesystemStatResult(value: unknown): FilesystemStatResult | null {
	if (value === null) return null;
	const result = parseOutputRecord(value);
	return {
		size: parseOutputNumber(result, "size"),
		modifiedAt: parseOutputNumber(result, "modifiedAt"),
		createdAt: parseOutputNumber(result, "createdAt"),
	};
}

function parseNullableOutputString(value: unknown): string | null {
	if (value === null) return null;
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be a string or null");
	}
	return value;
}

function parseOutputStrings(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be a string array");
	}
	return value;
}

function parseStorageBlobRef(value: unknown): StorageBlobRef {
	const result = parseOutputRecord(value);
	return {
		id: parseOutputString(result, "id"),
		url: parseOutputString(result, "url"),
		mimeType: parseOutputString(result, "mimeType"),
	};
}

function parseNullableStorageBlobRef(value: unknown): StorageBlobRef | null {
	return value === null ? null : parseStorageBlobRef(value);
}

function parseNullableStorageBlob(value: unknown): StorageBlob | null {
	if (value === null) return null;
	const result = parseOutputRecord(value);
	return {
		data: parseOutputString(result, "data"),
		mimeType: parseOutputString(result, "mimeType"),
	};
}

function parseVoidOutput(value: unknown): undefined {
	if (value !== undefined) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be undefined");
	}
	return undefined;
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

export const FOUNDATION_FILESYSTEM_CAPABILITIES = {
	READ_DIRECTORY: defineCapability<FilesystemPathInput, FilesystemEntry[]>({
		id: "cap.foundation.vetta.fs.read-directory",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseFilesystemEntries,
	}),
	READ_FILE: defineCapability<FilesystemPathInput, FilesystemReadFileResult>({
		id: "cap.foundation.vetta.fs.read-file",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseFilesystemReadFileResult,
	}),
	READ_BINARY_FILE: defineCapability<FilesystemPathInput, FilesystemReadBinaryFileResult>({
		id: "cap.foundation.vetta.fs.read-binary-file",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseFilesystemReadBinaryFileResult,
	}),
	WRITE_FILE: defineCapability<FilesystemWriteFileInput, undefined>({
		id: "cap.foundation.vetta.fs.write-file",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseWriteFileInput,
		parseOutput: parseVoidOutput,
	}),
	STAT: defineCapability<FilesystemPathInput, FilesystemStatResult | null>({
		id: "cap.foundation.vetta.fs.stat",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseFilesystemStatResult,
	}),
	RENAME: defineCapability<FilesystemRenameInput, undefined>({
		id: "cap.foundation.vetta.fs.rename",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseRenameInput,
		parseOutput: parseVoidOutput,
	}),
	DELETE: defineCapability<FilesystemPathInput, undefined>({
		id: "cap.foundation.vetta.fs.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseVoidOutput,
	}),
	MOVE: defineCapability<FilesystemMoveInput, undefined>({
		id: "cap.foundation.vetta.fs.move",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parseMoveInput,
		parseOutput: parseVoidOutput,
	}),
	CREATE_DIRECTORY: defineCapability<FilesystemPathInput, undefined>({
		id: "cap.foundation.vetta.fs.create-directory",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseVoidOutput,
	}),
	LIST_FILES_RECURSIVE: defineCapability<FilesystemPathInput, FilesystemFileRef[]>({
		id: "cap.foundation.vetta.fs.list-files-recursive",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePathInput,
		parseOutput: parseFilesystemFileRefs,
	}),
} as const;

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
