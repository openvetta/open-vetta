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

export interface PluginScopedCapabilityInput {
	readonly pluginId: string;
	readonly payload: CapabilityJsonValue;
}

export interface PluginStorageCapabilityInput extends PluginScopedCapabilityInput {
	readonly operation: string;
}

const STORAGE_NAMESPACE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const STORAGE_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;

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

function parsePluginScopedInput(value: unknown): PluginScopedCapabilityInput {
	const input = parseRecord(value);
	const pluginId = input.pluginId;
	if (typeof pluginId !== "string" || !PLUGIN_ID_PATTERN.test(pluginId)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Invalid plugin id");
	}
	return {
		pluginId,
		payload: parseCapabilityJsonValue(input.payload),
	};
}

function parsePluginStorageInput(value: unknown): PluginStorageCapabilityInput {
	const input = parseRecord(value);
	const scoped = parsePluginScopedInput(input);
	return {
		...scoped,
		operation: parseRequiredString(input, "operation"),
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

export const FOUNDATION_PLUGIN_NETWORK_CAPABILITIES = {
	REQUEST: defineCapability<PluginScopedCapabilityInput, CapabilityJsonValue>({
		id: "cap.foundation.vetta.plugin.network.request",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePluginScopedInput,
		parseOutput: parseCapabilityJsonValue,
	}),
} as const;

export const FOUNDATION_PLUGIN_STORAGE_CAPABILITIES = {
	READ: defineCapability<PluginStorageCapabilityInput, CapabilityJsonValue>({
		id: "cap.foundation.vetta.plugin.storage.read",
		kind: "query",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePluginStorageInput,
		parseOutput: parseCapabilityJsonValue,
	}),
	WRITE: defineCapability<PluginStorageCapabilityInput, CapabilityJsonValue>({
		id: "cap.foundation.vetta.plugin.storage.write",
		kind: "command",
		layer: CAPABILITY_LAYERS.FOUNDATION,
		version: 1,
		parseInput: parsePluginStorageInput,
		parseOutput: parseCapabilityJsonValue,
	}),
} as const;
