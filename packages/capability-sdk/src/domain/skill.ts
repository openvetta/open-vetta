import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalInputString,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const SKILL_TYPES = {
	SKILL: "skill",
	SCENE: "scene",
} as const;

export const INSTALLED_SKILL_SOURCES = {
	MARKET: "market",
	CUSTOM: "custom",
} as const;

export type SkillType = (typeof SKILL_TYPES)[keyof typeof SKILL_TYPES];
export type InstalledSkillSource = (typeof INSTALLED_SKILL_SOURCES)[keyof typeof INSTALLED_SKILL_SOURCES];

export interface SkillInfo {
	readonly name: string;
	readonly alias?: string;
	readonly description: string;
	readonly source: string;
	readonly type: SkillType;
}

export interface InstalledSkill {
	readonly name: string;
	readonly version: string;
	readonly installedAt: string;
	readonly source: InstalledSkillSource;
	readonly enabled: boolean;
	readonly type?: SkillType;
	readonly alias?: string;
	readonly marketDescription?: string;
	readonly description?: string;
}

export interface SkillListInput {
	readonly cwd?: string;
}

export interface SkillSetEnabledInput {
	readonly name: string;
	readonly enabled: boolean;
}

export interface SkillSetEnabledResult {
	readonly name: string;
	readonly enabled: boolean;
}

export interface SkillUninstallInput {
	readonly name: string;
	readonly type?: SkillType;
}

function parseSkillType(value: unknown, code: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT): SkillType;
function parseSkillType(value: unknown, code: typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT): SkillType;
function parseSkillType(
	value: unknown,
	code: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
): SkillType {
	if (typeof value !== "string" || !Object.values(SKILL_TYPES).includes(value as SkillType)) {
		throw new CapabilityError(code, "Capability skill type is invalid");
	}
	return value as SkillType;
}

function parseSkillInfo(value: unknown): SkillInfo {
	const skill = parseOutputRecord(value);
	const alias = parseOptionalOutputString(skill, "alias");
	return {
		name: parseRequiredOutputString(skill, "name"),
		...(alias === undefined ? {} : { alias }),
		description: parseRequiredOutputString(skill, "description"),
		source: parseRequiredOutputString(skill, "source"),
		type: parseSkillType(skill.type, CAPABILITY_ERROR_CODES.INVALID_OUTPUT),
	};
}

function parseSkillList(value: unknown): SkillInfo[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSkillInfo);
}

function parseInstalledSkill(value: unknown): InstalledSkill {
	const skill = parseOutputRecord(value);
	const source = skill.source;
	if (typeof source !== "string" || !Object.values(INSTALLED_SKILL_SOURCES).includes(source as InstalledSkillSource)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability installed skill source is invalid");
	}
	const type =
		skill.type === undefined ? undefined : parseSkillType(skill.type, CAPABILITY_ERROR_CODES.INVALID_OUTPUT);
	const alias = parseOptionalOutputString(skill, "alias");
	const marketDescription = parseOptionalOutputString(skill, "marketDescription");
	const description = parseOptionalOutputString(skill, "description");
	return {
		name: parseRequiredOutputString(skill, "name"),
		version: parseRequiredOutputString(skill, "version"),
		installedAt: parseRequiredOutputString(skill, "installedAt"),
		source: source as InstalledSkillSource,
		enabled: parseRequiredOutputBoolean(skill, "enabled"),
		...(type === undefined ? {} : { type }),
		...(alias === undefined ? {} : { alias }),
		...(marketDescription === undefined ? {} : { marketDescription }),
		...(description === undefined ? {} : { description }),
	};
}

function parseInstalledSkills(value: unknown): Record<string, InstalledSkill> {
	const manifest = parseOutputRecord(value);
	return Object.fromEntries(Object.entries(manifest).map(([name, skill]) => [name, parseInstalledSkill(skill)]));
}

function parseSkillListInput(value: unknown): SkillListInput {
	const input = parseInputRecord(value);
	const cwd = parseOptionalInputString(input, "cwd");
	return cwd === undefined ? {} : { cwd };
}

function parseSkillSetEnabledInput(value: unknown): SkillSetEnabledInput {
	const input = parseInputRecord(value);
	return {
		name: parseRequiredInputString(input, "name"),
		enabled: parseRequiredInputBoolean(input, "enabled"),
	};
}

function parseSkillSetEnabledResult(value: unknown): SkillSetEnabledResult {
	const result = parseOutputRecord(value);
	return {
		name: parseRequiredOutputString(result, "name"),
		enabled: parseRequiredOutputBoolean(result, "enabled"),
	};
}

function parseSkillUninstallInput(value: unknown): SkillUninstallInput {
	const input = parseInputRecord(value);
	const type = input.type === undefined ? undefined : parseSkillType(input.type, CAPABILITY_ERROR_CODES.INVALID_INPUT);
	return {
		name: parseRequiredInputString(input, "name"),
		...(type === undefined ? {} : { type }),
	};
}

export const DOMAIN_SKILL_CAPABILITIES = {
	LIST: defineCapability<SkillListInput, SkillInfo[]>({
		id: "cap.domain.vetta.skill.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSkillListInput,
		parseOutput: parseSkillList,
	}),
	LIST_INSTALLED: defineCapability<Record<string, never>, Record<string, InstalledSkill>>({
		id: "cap.domain.vetta.skill.installed.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseInstalledSkills,
	}),
	SET_ENABLED: defineCapability<SkillSetEnabledInput, SkillSetEnabledResult>({
		id: "cap.domain.vetta.skill.installed.set-enabled",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSkillSetEnabledInput,
		parseOutput: parseSkillSetEnabledResult,
	}),
	UNINSTALL: defineCapability<SkillUninstallInput, undefined>({
		id: "cap.domain.vetta.skill.installed.uninstall",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSkillUninstallInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
