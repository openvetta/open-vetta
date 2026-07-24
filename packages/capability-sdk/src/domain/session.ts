import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
} from "./parse-helpers.js";

export interface SessionListInput {
	readonly cwd: string;
}

export interface SessionRuntimeProject {
	readonly cwd: string;
	readonly sessionCount: number;
}

export interface SessionHistoryEntry {
	readonly id: string;
	readonly path: string;
	readonly cwd: string;
	readonly name?: string;
	readonly firstMessage: string;
	readonly modifiedAt: number;
	readonly lastMessagePreview?: string;
	readonly parentSessionPath?: string;
	readonly parentEntryId?: string;
}

function parseSessionListInput(value: unknown): SessionListInput {
	const input = parseInputRecord(value);
	return { cwd: parseRequiredInputString(input, "cwd") };
}

function parseSessionRuntimeProject(value: unknown): SessionRuntimeProject {
	const project = parseOutputRecord(value);
	const sessionCount = parseRequiredOutputNumber(project, "sessionCount");
	if (!Number.isInteger(sessionCount) || sessionCount < 0) {
		throw new CapabilityError(
			CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
			"Capability output sessionCount must be a non-negative integer",
		);
	}
	return {
		cwd: parseRequiredOutputString(project, "cwd"),
		sessionCount,
	};
}

function parseSessionRuntimeProjects(value: unknown): SessionRuntimeProject[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSessionRuntimeProject);
}

function parseSessionHistoryEntry(value: unknown): SessionHistoryEntry {
	const entry = parseOutputRecord(value);
	const name = parseOptionalOutputString(entry, "name");
	const lastMessagePreview = parseOptionalOutputString(entry, "lastMessagePreview");
	const parentSessionPath = parseOptionalOutputString(entry, "parentSessionPath");
	const parentEntryId = parseOptionalOutputString(entry, "parentEntryId");
	return {
		id: parseRequiredOutputString(entry, "id"),
		path: parseRequiredOutputString(entry, "path"),
		cwd: parseRequiredOutputString(entry, "cwd"),
		...(name === undefined ? {} : { name }),
		firstMessage: parseRequiredOutputString(entry, "firstMessage"),
		modifiedAt: parseRequiredOutputNumber(entry, "modifiedAt"),
		...(lastMessagePreview === undefined ? {} : { lastMessagePreview }),
		...(parentSessionPath === undefined ? {} : { parentSessionPath }),
		...(parentEntryId === undefined ? {} : { parentEntryId }),
	};
}

function parseSessionHistory(value: unknown): SessionHistoryEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSessionHistoryEntry);
}

export const DOMAIN_SESSION_CAPABILITIES = {
	LIST: defineCapability<SessionListInput, SessionHistoryEntry[]>({
		id: "cap.domain.vetta.session.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSessionListInput,
		parseOutput: parseSessionHistory,
	}),
	LIST_RUNTIME_PROJECTS: defineCapability<Record<string, never>, SessionRuntimeProject[]>({
		id: "cap.domain.vetta.session.runtime-project.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseSessionRuntimeProjects,
	}),
} as const;
