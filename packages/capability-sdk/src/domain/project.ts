import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalInputString,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export interface ProjectEntry {
	readonly path: string;
	readonly name?: string;
}

export interface ProjectListResult {
	readonly workspacePath: string;
	readonly projects: readonly ProjectEntry[];
	readonly archivedProjects: readonly ProjectEntry[];
}

export interface ProjectCreateInput {
	readonly name: string;
	readonly path?: string;
}

export interface ProjectOpenInput {
	readonly path: string;
	readonly name?: string;
}

export interface ProjectRenameInput {
	readonly path: string;
	readonly name: string;
}

export interface ProjectPathInput {
	readonly path: string;
}

function parseProjectEntry(value: unknown): ProjectEntry {
	const entry = parseOutputRecord(value);
	const name = entry.name;
	if (name !== undefined && typeof name !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output name must be a string");
	}
	return {
		path: parseRequiredOutputString(entry, "path"),
		...(name === undefined ? {} : { name }),
	};
}

function parseProjectEntries(value: unknown): ProjectEntry[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseProjectEntry);
}

function parseProjectListResult(value: unknown): ProjectListResult {
	const result = parseOutputRecord(value);
	return {
		workspacePath: parseRequiredOutputString(result, "workspacePath"),
		projects: parseProjectEntries(result.projects),
		archivedProjects: parseProjectEntries(result.archivedProjects),
	};
}

function parseProjectCreateInput(value: unknown): ProjectCreateInput {
	const input = parseInputRecord(value);
	const path = parseOptionalInputString(input, "path");
	return {
		name: parseRequiredInputString(input, "name"),
		...(path === undefined ? {} : { path }),
	};
}

function parseProjectOpenInput(value: unknown): ProjectOpenInput {
	const input = parseInputRecord(value);
	const name = parseOptionalInputString(input, "name");
	return {
		path: parseRequiredInputString(input, "path"),
		...(name === undefined ? {} : { name }),
	};
}

function parseProjectRenameInput(value: unknown): ProjectRenameInput {
	const input = parseInputRecord(value);
	return {
		path: parseRequiredInputString(input, "path"),
		name: parseRequiredInputString(input, "name"),
	};
}

function parseProjectPathInput(value: unknown): ProjectPathInput {
	const input = parseInputRecord(value);
	return { path: parseRequiredInputString(input, "path") };
}

export const DOMAIN_PROJECT_CAPABILITIES = {
	LIST: defineCapability<Record<string, never>, ProjectListResult>({
		id: "cap.domain.vetta.project.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseProjectListResult,
	}),
	CREATE: defineCapability<ProjectCreateInput, ProjectEntry>({
		id: "cap.domain.vetta.project.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectCreateInput,
		parseOutput: parseProjectEntry,
	}),
	OPEN: defineCapability<ProjectOpenInput, ProjectEntry>({
		id: "cap.domain.vetta.project.open",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectOpenInput,
		parseOutput: parseProjectEntry,
	}),
	RENAME: defineCapability<ProjectRenameInput, ProjectEntry>({
		id: "cap.domain.vetta.project.rename",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectRenameInput,
		parseOutput: parseProjectEntry,
	}),
	ARCHIVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.archive",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
	UNARCHIVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.unarchive",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
	REMOVE: defineCapability<ProjectPathInput, undefined>({
		id: "cap.domain.vetta.project.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProjectPathInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
