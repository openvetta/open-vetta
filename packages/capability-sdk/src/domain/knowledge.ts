import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const KNOWLEDGE_NODE_TYPES = {
	FILE: "file",
	DIRECTORY: "directory",
} as const;

export const KNOWLEDGE_PROCESS_STATUSES = {
	PROCESSED: "processed",
	STALE: "stale",
	FAILED: "failed",
	UNPROCESSED: "unprocessed",
} as const;

export const KNOWLEDGE_SCAN_REASONS = {
	NO_MODEL: "no-model",
} as const;

export type KnowledgeNodeType = (typeof KNOWLEDGE_NODE_TYPES)[keyof typeof KNOWLEDGE_NODE_TYPES];
export type KnowledgeProcessStatus = (typeof KNOWLEDGE_PROCESS_STATUSES)[keyof typeof KNOWLEDGE_PROCESS_STATUSES];
export type KnowledgeScanReason = (typeof KNOWLEDGE_SCAN_REASONS)[keyof typeof KNOWLEDGE_SCAN_REASONS];

export interface KnowledgeNode {
	readonly id: string;
	readonly name: string;
	readonly type: KnowledgeNodeType;
	readonly children?: KnowledgeNode[];
	readonly childCount?: number;
	readonly size?: number;
	readonly sourcePath?: string;
}

export interface KnowledgeBase {
	readonly id: string;
	readonly name: string;
	readonly updatedAt: number;
	readonly isDefault: boolean;
	readonly nodes: KnowledgeNode[];
}

export interface KnowledgeFileStatus {
	readonly status: KnowledgeProcessStatus;
	readonly wikiPath?: string;
}

export type KnowledgeFileStatuses = Record<string, KnowledgeFileStatus>;

export interface KnowledgeProcessingSettings {
	readonly enabled?: boolean;
	readonly pollIntervalMinutes?: number;
	readonly processingModelKey?: string;
	readonly processingModelReasoningLevel?: string;
	readonly agentConcurrency?: number;
	readonly ocrConcurrency?: number;
}

export interface KnowledgeProcessingUpdate {
	readonly enabled?: boolean;
	readonly pollIntervalMinutes?: number;
	readonly processingModelKey?: string | null;
	readonly processingModelReasoningLevel?: string | null;
	readonly agentConcurrency?: number;
	readonly ocrConcurrency?: number;
}

export interface KnowledgeScanResult {
	readonly skipped: boolean;
	readonly reason?: KnowledgeScanReason;
}

export interface KnowledgeNameInput {
	readonly name: string;
}

export interface KnowledgeRenameInput {
	readonly name: string;
	readonly newName: string;
}

export interface KnowledgeAddFilesInput {
	readonly kbId: string;
	readonly paths: string[];
	readonly move: boolean;
}

export interface KnowledgeDeleteEntryInput {
	readonly kbId: string;
	readonly relPath: string;
}

export interface KnowledgeSetProcessingInput {
	readonly data: KnowledgeProcessingUpdate;
}

const KNOWLEDGE_PROCESSING_KEYS = new Set([
	"enabled",
	"pollIntervalMinutes",
	"processingModelKey",
	"processingModelReasoningLevel",
	"agentConcurrency",
	"ocrConcurrency",
]);

function parseInputString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

function parseInputPositiveInteger(value: unknown, field: string): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_INPUT,
			`Capability field ${field} must be a positive integer`,
		);
	}
	return value;
}

function parseOutputNonNegativeNumber(input: Record<string, unknown>, field: string): number {
	const value = parseRequiredOutputNumber(input, field);
	if (value < 0) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
			`Capability output ${field} must be non-negative`,
		);
	}
	return value;
}

function parseOptionalOutputNonNegativeNumber(input: Record<string, unknown>, field: string): number | undefined {
	const value = parseOptionalOutputNumber(input, field);
	if (value !== undefined && value < 0) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
			`Capability output ${field} must be non-negative`,
		);
	}
	return value;
}

function parseKnowledgeNode(value: unknown): KnowledgeNode {
	const node = parseOutputRecord(value);
	const type = node.type;
	if (typeof type !== "string" || !Object.values(KNOWLEDGE_NODE_TYPES).includes(type as KnowledgeNodeType)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Knowledge node type is invalid");
	}
	const children = node.children === undefined ? undefined : parseKnowledgeNodes(node.children);
	const childCount = parseOptionalOutputNonNegativeNumber(node, "childCount");
	const size = parseOptionalOutputNonNegativeNumber(node, "size");
	const sourcePath = parseOptionalOutputString(node, "sourcePath");
	return {
		id: parseRequiredOutputString(node, "id"),
		name: parseRequiredOutputString(node, "name"),
		type: type as KnowledgeNodeType,
		...(children === undefined ? {} : { children }),
		...(childCount === undefined ? {} : { childCount }),
		...(size === undefined ? {} : { size }),
		...(sourcePath === undefined ? {} : { sourcePath }),
	};
}

function parseKnowledgeNodes(value: unknown): KnowledgeNode[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseKnowledgeNode);
}

function parseKnowledgeBase(value: unknown): KnowledgeBase {
	const base = parseOutputRecord(value);
	return {
		id: parseRequiredOutputString(base, "id"),
		name: parseRequiredOutputString(base, "name"),
		updatedAt: parseOutputNonNegativeNumber(base, "updatedAt"),
		isDefault: parseRequiredOutputBoolean(base, "isDefault"),
		nodes: parseKnowledgeNodes(base.nodes),
	};
}

function parseKnowledgeBases(value: unknown): KnowledgeBase[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseKnowledgeBase);
}

function parseKnowledgeFileStatus(value: unknown): KnowledgeFileStatus {
	const entry = parseOutputRecord(value);
	const status = entry.status;
	if (
		typeof status !== "string" ||
		!Object.values(KNOWLEDGE_PROCESS_STATUSES).includes(status as KnowledgeProcessStatus)
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Knowledge file status is invalid");
	}
	const wikiPath = parseOptionalOutputString(entry, "wikiPath");
	return { status: status as KnowledgeProcessStatus, ...(wikiPath === undefined ? {} : { wikiPath }) };
}

function parseKnowledgeFileStatuses(value: unknown): KnowledgeFileStatuses {
	const entries = parseOutputRecord(value);
	return Object.fromEntries(Object.entries(entries).map(([path, status]) => [path, parseKnowledgeFileStatus(status)]));
}

function parseKnowledgeProcessingSettings(value: unknown): KnowledgeProcessingSettings {
	const settings = parseOutputRecord(value);
	const result: KnowledgeProcessingSettings = {};
	if (settings.enabled !== undefined) {
		Object.assign(result, { enabled: parseRequiredOutputBoolean(settings, "enabled") });
	}
	for (const field of ["pollIntervalMinutes", "agentConcurrency", "ocrConcurrency"] as const) {
		if (settings[field] !== undefined) {
			const parsed = parseOutputNonNegativeNumber(settings, field);
			if (!Number.isInteger(parsed)) {
				throw new CapabilityError(
					CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
					`Capability output ${field} must be an integer`,
				);
			}
			Object.assign(result, { [field]: parsed });
		}
	}
	for (const field of ["processingModelKey", "processingModelReasoningLevel"] as const) {
		const parsed = parseOptionalOutputString(settings, field);
		if (parsed !== undefined) Object.assign(result, { [field]: parsed });
	}
	return result;
}

function parseKnowledgeProcessingUpdate(value: unknown): KnowledgeProcessingUpdate {
	const data = parseInputRecord(value);
	if (Object.keys(data).length === 0 || !Object.keys(data).every((key) => KNOWLEDGE_PROCESSING_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Knowledge processing update is invalid");
	}
	const result: KnowledgeProcessingUpdate = {};
	if (data.enabled !== undefined) Object.assign(result, { enabled: parseRequiredInputBoolean(data, "enabled") });
	if (data.pollIntervalMinutes !== undefined) {
		const interval = data.pollIntervalMinutes;
		if (typeof interval !== "number" || ![0, 3, 5, 10, 30].includes(interval)) {
			throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Knowledge poll interval is invalid");
		}
		Object.assign(result, { pollIntervalMinutes: interval });
	}
	for (const field of ["processingModelKey", "processingModelReasoningLevel"] as const) {
		const candidate = data[field];
		if (candidate !== undefined) {
			Object.assign(result, { [field]: candidate === null ? null : parseInputString(candidate, field) });
		}
	}
	for (const field of ["agentConcurrency", "ocrConcurrency"] as const) {
		if (data[field] !== undefined) {
			Object.assign(result, { [field]: parseInputPositiveInteger(data[field], field) });
		}
	}
	return result;
}

function parseKnowledgeNameInput(value: unknown): KnowledgeNameInput {
	const input = parseInputRecord(value);
	return { name: parseRequiredInputString(input, "name") };
}

function parseKnowledgeRenameInput(value: unknown): KnowledgeRenameInput {
	const input = parseInputRecord(value);
	return {
		name: parseRequiredInputString(input, "name"),
		newName: parseRequiredInputString(input, "newName"),
	};
}

function parseKnowledgeAddFilesInput(value: unknown): KnowledgeAddFilesInput {
	const input = parseInputRecord(value);
	if (
		!Array.isArray(input.paths) ||
		!input.paths.every((path) => typeof path === "string" && path.trim().length > 0)
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Knowledge file paths are invalid");
	}
	return {
		kbId: parseRequiredInputString(input, "kbId"),
		paths: [...input.paths],
		move: parseRequiredInputBoolean(input, "move"),
	};
}

function parseKnowledgeDeleteEntryInput(value: unknown): KnowledgeDeleteEntryInput {
	const input = parseInputRecord(value);
	return {
		kbId: parseRequiredInputString(input, "kbId"),
		relPath: parseRequiredInputString(input, "relPath"),
	};
}

function parseKnowledgeSetProcessingInput(value: unknown): KnowledgeSetProcessingInput {
	const input = parseInputRecord(value);
	return { data: parseKnowledgeProcessingUpdate(input.data) };
}

function parseKnowledgeScanResult(value: unknown): KnowledgeScanResult {
	const result = parseOutputRecord(value);
	const reason = result.reason;
	if (reason !== undefined && reason !== KNOWLEDGE_SCAN_REASONS.NO_MODEL) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Knowledge scan reason is invalid");
	}
	return {
		skipped: parseRequiredOutputBoolean(result, "skipped"),
		...(reason === undefined ? {} : { reason }),
	};
}

export const DOMAIN_KNOWLEDGE_CAPABILITIES = {
	LIST_BASES: defineCapability<Record<string, never>, KnowledgeBase[]>({
		id: "cap.domain.vetta.knowledge.base.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseKnowledgeBases,
	}),
	LIST_FILE_STATUSES: defineCapability<Record<string, never>, KnowledgeFileStatuses>({
		id: "cap.domain.vetta.knowledge.file-status.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseKnowledgeFileStatuses,
	}),
	GET_PROCESSING_STATUS: defineCapability<Record<string, never>, boolean>({
		id: "cap.domain.vetta.knowledge.processing.status.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: (value) => {
			if (typeof value !== "boolean") {
				throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be a boolean");
			}
			return value;
		},
	}),
	GET_PROCESSING_SETTINGS: defineCapability<Record<string, never>, KnowledgeProcessingSettings>({
		id: "cap.domain.vetta.knowledge.processing.settings.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseKnowledgeProcessingSettings,
	}),
	CREATE_BASE: defineCapability<KnowledgeNameInput, undefined>({
		id: "cap.domain.vetta.knowledge.base.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeNameInput,
		parseOutput: parseVoidOutput,
	}),
	RENAME_BASE: defineCapability<KnowledgeRenameInput, undefined>({
		id: "cap.domain.vetta.knowledge.base.rename",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeRenameInput,
		parseOutput: parseVoidOutput,
	}),
	DELETE_BASE: defineCapability<KnowledgeNameInput, undefined>({
		id: "cap.domain.vetta.knowledge.base.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeNameInput,
		parseOutput: parseVoidOutput,
	}),
	ADD_FILES: defineCapability<KnowledgeAddFilesInput, undefined>({
		id: "cap.domain.vetta.knowledge.entry.add-files",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeAddFilesInput,
		parseOutput: parseVoidOutput,
	}),
	DELETE_ENTRY: defineCapability<KnowledgeDeleteEntryInput, undefined>({
		id: "cap.domain.vetta.knowledge.entry.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeDeleteEntryInput,
		parseOutput: parseVoidOutput,
	}),
	SCAN_NOW: defineCapability<Record<string, never>, KnowledgeScanResult>({
		id: "cap.domain.vetta.knowledge.processing.scan",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseKnowledgeScanResult,
	}),
	RETRY_FAILED: defineCapability<Record<string, never>, KnowledgeScanResult>({
		id: "cap.domain.vetta.knowledge.processing.retry-failed",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseKnowledgeScanResult,
	}),
	SET_PROCESSING_SETTINGS: defineCapability<KnowledgeSetProcessingInput, KnowledgeProcessingSettings>({
		id: "cap.domain.vetta.knowledge.processing.settings.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseKnowledgeSetProcessingInput,
		parseOutput: parseKnowledgeProcessingSettings,
	}),
} as const;
