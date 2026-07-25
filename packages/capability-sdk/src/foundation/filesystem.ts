import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseInputRecord,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

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

function parsePathInput(value: unknown): FilesystemPathInput {
	const input = parseInputRecord(value);
	return { path: parseRequiredInputString(input, "path") };
}

function parseRenameInput(value: unknown): FilesystemRenameInput {
	const input = parseInputRecord(value);
	return {
		oldPath: parseRequiredInputString(input, "oldPath"),
		newPath: parseRequiredInputString(input, "newPath"),
	};
}

function parseMoveInput(value: unknown): FilesystemMoveInput {
	const input = parseInputRecord(value);
	return {
		sourcePath: parseRequiredInputString(input, "sourcePath"),
		destinationDirectory: parseRequiredInputString(input, "destinationDirectory"),
	};
}

function parseWriteFileInput(value: unknown): FilesystemWriteFileInput {
	const input = parseInputRecord(value);
	const content = input.content;
	if (typeof content !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Filesystem content must be a string");
	}
	const encoding = input.encoding;
	if (encoding !== undefined && encoding !== "utf8" && encoding !== "base64") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Invalid filesystem encoding");
	}
	return {
		path: parseRequiredInputString(input, "path"),
		content,
		...(encoding === undefined ? {} : { encoding }),
	};
}

function parseFilesystemEntry(value: unknown): FilesystemEntry {
	const entry = parseOutputRecord(value);
	if (typeof entry.isDirectory !== "boolean") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output isDirectory must be boolean");
	}
	return {
		name: parseRequiredOutputString(entry, "name"),
		path: parseRequiredOutputString(entry, "path"),
		isDirectory: entry.isDirectory,
		size: parseRequiredOutputNumber(entry, "size"),
		modifiedAt: parseRequiredOutputNumber(entry, "modifiedAt"),
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
		name: parseRequiredOutputString(file, "name"),
		path: parseRequiredOutputString(file, "path"),
		relPath: parseRequiredOutputString(file, "relPath"),
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
		content: parseRequiredOutputString(result, "content"),
		encoding: result.encoding,
	};
}

function parseFilesystemReadBinaryFileResult(value: unknown): FilesystemReadBinaryFileResult {
	const result = parseOutputRecord(value);
	return {
		data: parseRequiredOutputString(result, "data"),
		mimeType: parseRequiredOutputString(result, "mimeType"),
		size: parseRequiredOutputNumber(result, "size"),
	};
}

function parseFilesystemStatResult(value: unknown): FilesystemStatResult | null {
	if (value === null) return null;
	const result = parseOutputRecord(value);
	return {
		size: parseRequiredOutputNumber(result, "size"),
		modifiedAt: parseRequiredOutputNumber(result, "modifiedAt"),
		createdAt: parseRequiredOutputNumber(result, "createdAt"),
	};
}

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
