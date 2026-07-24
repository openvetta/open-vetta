import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalInputString,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
} from "./parse-helpers.js";

export const SCHEDULER_EXECUTION_MODES = {
	INHERIT: "inherit",
	SANDBOX: "sandbox",
	FULL_ACCESS: "full-access",
} as const;

export const SCHEDULER_SKILL_TYPES = {
	SKILL: "skill",
	SCENE: "scene",
} as const;

export const SCHEDULER_LAST_RUN_STATUSES = {
	SUCCESS: "success",
	FAILED: "failed",
} as const;

export const SCHEDULER_RECORD_STATUSES = {
	RUNNING: "running",
	SUCCESS: "success",
	FAILED: "failed",
	ABORTED: "aborted",
} as const;

export const SCHEDULER_COMMAND_STATUSES = {
	ACCEPTED: "accepted",
	NOOP: "noop",
} as const;

export type SchedulerExecutionMode = (typeof SCHEDULER_EXECUTION_MODES)[keyof typeof SCHEDULER_EXECUTION_MODES];
export type SchedulerSkillType = (typeof SCHEDULER_SKILL_TYPES)[keyof typeof SCHEDULER_SKILL_TYPES];
export type SchedulerLastRunStatus = (typeof SCHEDULER_LAST_RUN_STATUSES)[keyof typeof SCHEDULER_LAST_RUN_STATUSES];
export type SchedulerRecordStatus = (typeof SCHEDULER_RECORD_STATUSES)[keyof typeof SCHEDULER_RECORD_STATUSES];
export type SchedulerCommandStatus = (typeof SCHEDULER_COMMAND_STATUSES)[keyof typeof SCHEDULER_COMMAND_STATUSES];

export interface SchedulerSkillRef {
	readonly name: string;
	readonly alias?: string;
	readonly type: SchedulerSkillType;
}

export interface SchedulerTask {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce: boolean;
	readonly enabled: boolean;
	readonly cwd: string;
	readonly modelKey?: string;
	readonly executionMode?: SchedulerExecutionMode;
	readonly skill?: SchedulerSkillRef;
	readonly createdAt: number;
	readonly updatedAt: number;
	readonly lastRunAt: number | null;
	readonly lastRunStatus: SchedulerLastRunStatus | null;
}

export interface SchedulerTaskCreateData {
	readonly name: string;
	readonly prompt: string;
	readonly cron: string;
	readonly isOnce: boolean;
	readonly enabled: boolean;
	readonly cwd: string;
	readonly modelKey?: string;
	readonly executionMode?: SchedulerExecutionMode;
	readonly skill?: SchedulerSkillRef;
}

export interface SchedulerTaskUpdateData {
	readonly name?: string;
	readonly prompt?: string;
	readonly cron?: string;
	readonly isOnce?: boolean;
	readonly enabled?: boolean;
	readonly cwd?: string;
	readonly modelKey?: string | undefined;
	readonly executionMode?: SchedulerExecutionMode;
	readonly skill?: SchedulerSkillRef | undefined;
}

export interface SchedulerTaskIdInput {
	readonly taskId: string;
}

export interface SchedulerTaskCreateInput {
	readonly data: SchedulerTaskCreateData;
}

export interface SchedulerTaskUpdateInput {
	readonly taskId: string;
	readonly data: SchedulerTaskUpdateData;
}

export interface SchedulerTaskSetEnabledInput {
	readonly taskId: string;
	readonly enabled: boolean;
}

export interface SchedulerExecutionRecord {
	readonly id: string;
	readonly taskId: string;
	readonly sessionId: string;
	readonly sessionPath?: string;
	readonly cwd?: string;
	readonly startedAt: number;
	readonly completedAt: number | null;
	readonly status: SchedulerRecordStatus;
	readonly prompt: string;
	readonly responsePreview: string;
	readonly error?: string;
	readonly durationMs?: number;
	readonly executionMode?: Exclude<SchedulerExecutionMode, "inherit">;
}

export interface SchedulerCommandResult {
	readonly status: SchedulerCommandStatus;
	readonly taskId: string;
}

const SCHEDULER_TASK_DATA_KEYS = new Set([
	"name",
	"prompt",
	"cron",
	"isOnce",
	"enabled",
	"cwd",
	"modelKey",
	"executionMode",
	"skill",
]);

function parseSchedulerExecutionMode(value: unknown, output: boolean): SchedulerExecutionMode {
	if (
		typeof value !== "string" ||
		!Object.values(SCHEDULER_EXECUTION_MODES).includes(value as SchedulerExecutionMode)
	) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Scheduler execution mode is invalid",
		);
	}
	return value as SchedulerExecutionMode;
}

function parseSchedulerSkill(value: unknown, output: boolean): SchedulerSkillRef {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Scheduler skill must be an object",
		);
	}
	const skill = value as Record<string, unknown>;
	const type = skill.type;
	if (typeof type !== "string" || !Object.values(SCHEDULER_SKILL_TYPES).includes(type as SchedulerSkillType)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Scheduler skill type is invalid",
		);
	}
	const parseString = output ? parseRequiredOutputString : parseRequiredInputString;
	const alias = skill.alias;
	if (alias !== undefined && (typeof alias !== "string" || alias.trim().length === 0)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Scheduler skill alias must be a string",
		);
	}
	return {
		name: parseString(skill, "name"),
		...(alias === undefined ? {} : { alias }),
		type: type as SchedulerSkillType,
	};
}

function parseSchedulerTaskCreateData(value: unknown): SchedulerTaskCreateData {
	const data = parseInputRecord(value);
	if (!Object.keys(data).every((key) => SCHEDULER_TASK_DATA_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Scheduled task contains unknown fields");
	}
	const modelKey = parseOptionalInputString(data, "modelKey");
	const executionMode =
		data.executionMode === undefined ? undefined : parseSchedulerExecutionMode(data.executionMode, false);
	const skill = data.skill === undefined ? undefined : parseSchedulerSkill(data.skill, false);
	return {
		name: parseRequiredInputString(data, "name"),
		prompt: parseRequiredInputString(data, "prompt"),
		cron: parseRequiredInputString(data, "cron"),
		isOnce: parseRequiredInputBoolean(data, "isOnce"),
		enabled: parseRequiredInputBoolean(data, "enabled"),
		cwd: parseRequiredInputString(data, "cwd"),
		...(modelKey === undefined ? {} : { modelKey }),
		...(executionMode === undefined ? {} : { executionMode }),
		...(skill === undefined ? {} : { skill }),
	};
}

function parseSchedulerTaskUpdateData(value: unknown): SchedulerTaskUpdateData {
	const data = parseInputRecord(value);
	if (Object.keys(data).length === 0 || !Object.keys(data).every((key) => SCHEDULER_TASK_DATA_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Scheduled task update fields are invalid");
	}
	const result: SchedulerTaskUpdateData = {};
	for (const field of ["name", "prompt", "cron", "cwd"] as const) {
		if (field in data) Object.assign(result, { [field]: parseRequiredInputString(data, field) });
	}
	for (const field of ["isOnce", "enabled"] as const) {
		if (field in data) Object.assign(result, { [field]: parseRequiredInputBoolean(data, field) });
	}
	if ("modelKey" in data) {
		Object.assign(result, {
			modelKey: data.modelKey === undefined ? undefined : parseRequiredInputString(data, "modelKey"),
		});
	}
	if ("executionMode" in data) {
		Object.assign(result, { executionMode: parseSchedulerExecutionMode(data.executionMode, false) });
	}
	if ("skill" in data) {
		Object.assign(result, { skill: data.skill === undefined ? undefined : parseSchedulerSkill(data.skill, false) });
	}
	return result;
}

function parseSchedulerTaskIdInput(value: unknown): SchedulerTaskIdInput {
	const input = parseInputRecord(value);
	return { taskId: parseRequiredInputString(input, "taskId") };
}

function parseSchedulerTaskCreateInput(value: unknown): SchedulerTaskCreateInput {
	const input = parseInputRecord(value);
	return { data: parseSchedulerTaskCreateData(input.data) };
}

function parseSchedulerTaskUpdateInput(value: unknown): SchedulerTaskUpdateInput {
	const input = parseInputRecord(value);
	return {
		taskId: parseRequiredInputString(input, "taskId"),
		data: parseSchedulerTaskUpdateData(input.data),
	};
}

function parseSchedulerTaskSetEnabledInput(value: unknown): SchedulerTaskSetEnabledInput {
	const input = parseInputRecord(value);
	return {
		taskId: parseRequiredInputString(input, "taskId"),
		enabled: parseRequiredInputBoolean(input, "enabled"),
	};
}

function parseSchedulerTask(value: unknown): SchedulerTask {
	const task = parseOutputRecord(value);
	const modelKey = parseOptionalOutputString(task, "modelKey");
	const executionMode =
		task.executionMode === undefined ? undefined : parseSchedulerExecutionMode(task.executionMode, true);
	const skill = task.skill === undefined ? undefined : parseSchedulerSkill(task.skill, true);
	const lastRunAt = task.lastRunAt;
	if (lastRunAt !== null && (typeof lastRunAt !== "number" || !Number.isFinite(lastRunAt))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler lastRunAt is invalid");
	}
	const lastRunStatus = task.lastRunStatus;
	if (
		lastRunStatus !== null &&
		(typeof lastRunStatus !== "string" ||
			!Object.values(SCHEDULER_LAST_RUN_STATUSES).includes(lastRunStatus as SchedulerLastRunStatus))
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler lastRunStatus is invalid");
	}
	return {
		id: parseRequiredOutputString(task, "id"),
		name: parseRequiredOutputString(task, "name"),
		prompt: parseRequiredOutputString(task, "prompt"),
		cron: parseRequiredOutputString(task, "cron"),
		isOnce: parseRequiredOutputBoolean(task, "isOnce"),
		enabled: parseRequiredOutputBoolean(task, "enabled"),
		cwd: parseRequiredOutputString(task, "cwd"),
		...(modelKey === undefined ? {} : { modelKey }),
		...(executionMode === undefined ? {} : { executionMode }),
		...(skill === undefined ? {} : { skill }),
		createdAt: parseRequiredOutputNumber(task, "createdAt"),
		updatedAt: parseRequiredOutputNumber(task, "updatedAt"),
		lastRunAt,
		lastRunStatus: lastRunStatus as SchedulerLastRunStatus | null,
	};
}

function parseSchedulerTasks(value: unknown): SchedulerTask[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSchedulerTask);
}

function parseSchedulerExecutionRecord(value: unknown): SchedulerExecutionRecord {
	const record = parseOutputRecord(value);
	const sessionPath = parseOptionalOutputString(record, "sessionPath");
	const cwd = parseOptionalOutputString(record, "cwd");
	const error = parseOptionalOutputString(record, "error");
	const durationMs = parseOptionalOutputNumber(record, "durationMs");
	const executionMode =
		record.executionMode === undefined ? undefined : parseSchedulerExecutionMode(record.executionMode, true);
	if (executionMode === SCHEDULER_EXECUTION_MODES.INHERIT) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler record execution mode is invalid");
	}
	const completedAt = record.completedAt;
	if (completedAt !== null && (typeof completedAt !== "number" || !Number.isFinite(completedAt))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler completedAt is invalid");
	}
	const status = record.status;
	if (
		typeof status !== "string" ||
		!Object.values(SCHEDULER_RECORD_STATUSES).includes(status as SchedulerRecordStatus)
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler record status is invalid");
	}
	return {
		id: parseRequiredOutputString(record, "id"),
		taskId: parseRequiredOutputString(record, "taskId"),
		sessionId: parseRequiredOutputString(record, "sessionId"),
		...(sessionPath === undefined ? {} : { sessionPath }),
		...(cwd === undefined ? {} : { cwd }),
		startedAt: parseRequiredOutputNumber(record, "startedAt"),
		completedAt,
		status: status as SchedulerRecordStatus,
		prompt: parseRequiredOutputString(record, "prompt"),
		responsePreview: parseRequiredOutputString(record, "responsePreview"),
		...(error === undefined ? {} : { error }),
		...(durationMs === undefined ? {} : { durationMs }),
		...(executionMode === undefined ? {} : { executionMode }),
	};
}

function parseSchedulerExecutionRecords(value: unknown): SchedulerExecutionRecord[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseSchedulerExecutionRecord);
}

function parseSchedulerCommandResult(value: unknown): SchedulerCommandResult {
	const result = parseOutputRecord(value);
	const status = result.status;
	if (
		typeof status !== "string" ||
		!Object.values(SCHEDULER_COMMAND_STATUSES).includes(status as SchedulerCommandStatus)
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Scheduler command status is invalid");
	}
	return {
		status: status as SchedulerCommandStatus,
		taskId: parseRequiredOutputString(result, "taskId"),
	};
}

export const DOMAIN_SCHEDULER_CAPABILITIES = {
	LIST_TASKS: defineCapability<Record<string, never>, SchedulerTask[]>({
		id: "cap.domain.vetta.scheduler.task.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseSchedulerTasks,
	}),
	GET_TASK: defineCapability<SchedulerTaskIdInput, SchedulerTask>({
		id: "cap.domain.vetta.scheduler.task.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskIdInput,
		parseOutput: parseSchedulerTask,
	}),
	LIST_HISTORY: defineCapability<SchedulerTaskIdInput, SchedulerExecutionRecord[]>({
		id: "cap.domain.vetta.scheduler.task.history.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskIdInput,
		parseOutput: parseSchedulerExecutionRecords,
	}),
	CREATE_TASK: defineCapability<SchedulerTaskCreateInput, SchedulerTask>({
		id: "cap.domain.vetta.scheduler.task.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskCreateInput,
		parseOutput: parseSchedulerTask,
	}),
	UPDATE_TASK: defineCapability<SchedulerTaskUpdateInput, SchedulerTask>({
		id: "cap.domain.vetta.scheduler.task.update",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskUpdateInput,
		parseOutput: parseSchedulerTask,
	}),
	DELETE_TASK: defineCapability<SchedulerTaskIdInput, SchedulerCommandResult>({
		id: "cap.domain.vetta.scheduler.task.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskIdInput,
		parseOutput: parseSchedulerCommandResult,
	}),
	SET_ENABLED: defineCapability<SchedulerTaskSetEnabledInput, SchedulerTask>({
		id: "cap.domain.vetta.scheduler.task.set-enabled",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskSetEnabledInput,
		parseOutput: parseSchedulerTask,
	}),
	RUN_TASK: defineCapability<SchedulerTaskIdInput, SchedulerCommandResult>({
		id: "cap.domain.vetta.scheduler.task.run",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskIdInput,
		parseOutput: parseSchedulerCommandResult,
	}),
	ABORT_TASK: defineCapability<SchedulerTaskIdInput, SchedulerCommandResult>({
		id: "cap.domain.vetta.scheduler.task.abort",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseSchedulerTaskIdInput,
		parseOutput: parseSchedulerCommandResult,
	}),
} as const;
