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
} from "./parse-helpers.js";

export const BATCH_TASK_STATUSES = {
	PENDING: "pending",
	RUNNING: "running",
	COMPLETED: "completed",
	FAILED: "failed",
	PAUSED: "paused",
} as const;

export const BATCH_EXECUTION_MODES = {
	INHERIT: "inherit",
	SANDBOX: "sandbox",
	FULL_ACCESS: "full-access",
} as const;

export const BATCH_SKILL_TYPES = {
	SKILL: "skill",
	SCENE: "scene",
} as const;

export const BATCH_COMMAND_STATUSES = {
	ACCEPTED: "accepted",
	NOOP: "noop",
} as const;

export type BatchTaskStatus = (typeof BATCH_TASK_STATUSES)[keyof typeof BATCH_TASK_STATUSES];
export type BatchExecutionMode = (typeof BATCH_EXECUTION_MODES)[keyof typeof BATCH_EXECUTION_MODES];
export type BatchSkillType = (typeof BATCH_SKILL_TYPES)[keyof typeof BATCH_SKILL_TYPES];
export type BatchCommandStatus = (typeof BATCH_COMMAND_STATUSES)[keyof typeof BATCH_COMMAND_STATUSES];

export interface BatchSkillRef {
	readonly name: string;
	readonly alias?: string;
	readonly type: BatchSkillType;
}

export interface BatchTask {
	readonly id: string;
	readonly name: string;
	readonly cwd: string;
	readonly sourcePath: string;
	readonly status: BatchTaskStatus;
	readonly sessionId?: string;
	readonly sessionPath?: string;
	readonly executionMode?: Exclude<BatchExecutionMode, "inherit">;
	readonly error?: string;
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface BatchProject {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly modelKey?: string;
	readonly executionMode?: BatchExecutionMode;
	readonly concurrency: number;
	readonly artifactPatterns?: string[];
	readonly notifyEnabled?: boolean;
	readonly timeoutMinutes?: number;
	readonly skill?: BatchSkillRef;
	readonly tasks: BatchTask[];
	readonly createdAt: number;
	readonly updatedAt: number;
}

export interface BatchProjectCreateData {
	readonly name: string;
	readonly prompt: string;
	readonly modelKey?: string;
	readonly folders: string[];
	readonly concurrency: number;
	readonly executionMode?: BatchExecutionMode;
	readonly artifactPatterns?: string[];
	readonly notifyEnabled?: boolean;
	readonly timeoutMinutes?: number;
	readonly skill?: BatchSkillRef;
}

export interface BatchProjectUpdateData {
	readonly name?: string;
	readonly prompt?: string;
	readonly modelKey?: string;
	readonly concurrency?: number;
	readonly executionMode?: BatchExecutionMode;
	readonly artifactPatterns?: string[];
	readonly notifyEnabled?: boolean;
	readonly timeoutMinutes?: number;
	readonly newFolders?: string[];
	readonly skill?: BatchSkillRef | null;
}

export interface BatchProjectIdInput {
	readonly projectId: string;
}

export interface BatchTaskIdInput extends BatchProjectIdInput {
	readonly taskId: string;
}

export interface BatchTaskIdsInput extends BatchProjectIdInput {
	readonly taskIds: string[];
}

export interface BatchTaskResumeInput extends BatchTaskIdInput {
	readonly text: string;
}

export interface BatchProjectCreateInput {
	readonly data: BatchProjectCreateData;
}

export interface BatchProjectUpdateInput extends BatchProjectIdInput {
	readonly data: BatchProjectUpdateData;
}

export interface BatchTaskCommandResult {
	readonly status: BatchCommandStatus;
	readonly projectId: string;
	readonly affectedTaskIds: string[];
	readonly queuedTaskIds: string[];
}

const BATCH_PROJECT_CREATE_KEYS = new Set([
	"name",
	"prompt",
	"modelKey",
	"folders",
	"concurrency",
	"executionMode",
	"artifactPatterns",
	"notifyEnabled",
	"timeoutMinutes",
	"skill",
]);

const BATCH_PROJECT_UPDATE_KEYS = new Set([
	"name",
	"prompt",
	"modelKey",
	"concurrency",
	"executionMode",
	"artifactPatterns",
	"notifyEnabled",
	"timeoutMinutes",
	"newFolders",
	"skill",
]);

function parseInputString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

function parseInputInteger(value: unknown, field: string, min: number, max: number): number {
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} is invalid`);
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

function parseExecutionMode(value: unknown, output: boolean): BatchExecutionMode {
	if (typeof value !== "string" || !Object.values(BATCH_EXECUTION_MODES).includes(value as BatchExecutionMode)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Batch execution mode is invalid",
		);
	}
	return value as BatchExecutionMode;
}

function parseSkill(value: unknown, output: boolean): BatchSkillRef {
	const skill = output ? parseOutputRecord(value) : parseInputRecord(value);
	if (!Object.keys(skill).every((key) => key === "name" || key === "alias" || key === "type")) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Batch skill contains unknown fields",
		);
	}
	const type = skill.type;
	if (typeof type !== "string" || !Object.values(BATCH_SKILL_TYPES).includes(type as BatchSkillType)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Batch skill type is invalid",
		);
	}
	const name = output ? parseRequiredOutputString(skill, "name") : parseRequiredInputString(skill, "name");
	const alias =
		skill.alias === undefined
			? undefined
			: output
				? parseRequiredOutputString(skill, "alias")
				: parseRequiredInputString(skill, "alias");
	return { name, ...(alias === undefined ? {} : { alias }), type: type as BatchSkillType };
}

function parseInputStringArray(value: unknown, field: string, allowEmpty: boolean): string[] {
	if (
		!Array.isArray(value) ||
		(!allowEmpty && value.length === 0) ||
		!value.every((entry) => typeof entry === "string" && entry.trim().length > 0)
	) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} is invalid`);
	}
	return [...value];
}

function parseOutputStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, `Capability output ${field} is invalid`);
	}
	return [...value];
}

function parseBatchTask(value: unknown): BatchTask {
	const task = parseOutputRecord(value);
	const status = task.status;
	if (typeof status !== "string" || !Object.values(BATCH_TASK_STATUSES).includes(status as BatchTaskStatus)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Batch task status is invalid");
	}
	const sessionId = parseOptionalOutputString(task, "sessionId");
	const sessionPath = parseOptionalOutputString(task, "sessionPath");
	const error = parseOptionalOutputString(task, "error");
	const executionMode = task.executionMode === undefined ? undefined : parseExecutionMode(task.executionMode, true);
	if (executionMode === BATCH_EXECUTION_MODES.INHERIT) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Batch task execution mode is invalid");
	}
	return {
		id: parseRequiredOutputString(task, "id"),
		name: parseRequiredOutputString(task, "name"),
		cwd: parseRequiredOutputString(task, "cwd"),
		sourcePath: parseRequiredOutputString(task, "sourcePath"),
		status: status as BatchTaskStatus,
		...(sessionId === undefined ? {} : { sessionId }),
		...(sessionPath === undefined ? {} : { sessionPath }),
		...(executionMode === undefined ? {} : { executionMode }),
		...(error === undefined ? {} : { error }),
		createdAt: parseOutputNonNegativeNumber(task, "createdAt"),
		updatedAt: parseOutputNonNegativeNumber(task, "updatedAt"),
	};
}

function parseBatchTasks(value: unknown): BatchTask[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseBatchTask);
}

function parseBatchProject(value: unknown): BatchProject {
	const project = parseOutputRecord(value);
	const modelKey = parseOptionalOutputString(project, "modelKey");
	const executionMode =
		project.executionMode === undefined ? undefined : parseExecutionMode(project.executionMode, true);
	const artifactPatterns =
		project.artifactPatterns === undefined
			? undefined
			: parseOutputStringArray(project.artifactPatterns, "artifactPatterns");
	const notifyEnabled =
		project.notifyEnabled === undefined ? undefined : parseRequiredOutputBoolean(project, "notifyEnabled");
	const timeoutMinutes = parseOptionalOutputNumber(project, "timeoutMinutes");
	const skill = project.skill === undefined ? undefined : parseSkill(project.skill, true);
	const concurrency = parseRequiredOutputNumber(project, "concurrency");
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Batch project concurrency is invalid");
	}
	return {
		id: parseRequiredOutputString(project, "id"),
		name: parseRequiredOutputString(project, "name"),
		prompt: parseRequiredOutputString(project, "prompt"),
		...(modelKey === undefined ? {} : { modelKey }),
		...(executionMode === undefined ? {} : { executionMode }),
		concurrency,
		...(artifactPatterns === undefined ? {} : { artifactPatterns }),
		...(notifyEnabled === undefined ? {} : { notifyEnabled }),
		...(timeoutMinutes === undefined ? {} : { timeoutMinutes }),
		...(skill === undefined ? {} : { skill }),
		tasks: parseBatchTasks(project.tasks),
		createdAt: parseOutputNonNegativeNumber(project, "createdAt"),
		updatedAt: parseOutputNonNegativeNumber(project, "updatedAt"),
	};
}

function parseBatchProjects(value: unknown): BatchProject[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseBatchProject);
}

function parseBatchProjectCreateData(value: unknown): BatchProjectCreateData {
	const data = parseInputRecord(value);
	if (!Object.keys(data).every((key) => BATCH_PROJECT_CREATE_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Batch project create fields are invalid");
	}
	const modelKey = data.modelKey === undefined ? undefined : parseRequiredInputString(data, "modelKey");
	const executionMode = data.executionMode === undefined ? undefined : parseExecutionMode(data.executionMode, false);
	const artifactPatterns =
		data.artifactPatterns === undefined
			? undefined
			: parseInputStringArray(data.artifactPatterns, "artifactPatterns", true);
	const notifyEnabled =
		data.notifyEnabled === undefined ? undefined : parseRequiredInputBoolean(data, "notifyEnabled");
	const timeoutMinutes =
		data.timeoutMinutes === undefined
			? undefined
			: parseInputInteger(data.timeoutMinutes, "timeoutMinutes", 1, 10_080);
	const skill = data.skill === undefined ? undefined : parseSkill(data.skill, false);
	return {
		name: parseRequiredInputString(data, "name"),
		prompt: parseInputString(data.prompt, "prompt"),
		...(modelKey === undefined ? {} : { modelKey }),
		folders: parseInputStringArray(data.folders, "folders", false),
		concurrency: parseInputInteger(data.concurrency, "concurrency", 1, 64),
		...(executionMode === undefined ? {} : { executionMode }),
		...(artifactPatterns === undefined ? {} : { artifactPatterns }),
		...(notifyEnabled === undefined ? {} : { notifyEnabled }),
		...(timeoutMinutes === undefined ? {} : { timeoutMinutes }),
		...(skill === undefined ? {} : { skill }),
	};
}

function parseBatchProjectUpdateData(value: unknown): BatchProjectUpdateData {
	const data = parseInputRecord(value);
	if (Object.keys(data).length === 0 || !Object.keys(data).every((key) => BATCH_PROJECT_UPDATE_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Batch project update fields are invalid");
	}
	const result: BatchProjectUpdateData = {};
	if (data.name !== undefined) Object.assign(result, { name: parseRequiredInputString(data, "name") });
	if (data.prompt !== undefined) Object.assign(result, { prompt: parseInputString(data.prompt, "prompt") });
	if (data.modelKey !== undefined) Object.assign(result, { modelKey: parseRequiredInputString(data, "modelKey") });
	if (data.concurrency !== undefined) {
		Object.assign(result, { concurrency: parseInputInteger(data.concurrency, "concurrency", 1, 64) });
	}
	if (data.executionMode !== undefined) {
		Object.assign(result, { executionMode: parseExecutionMode(data.executionMode, false) });
	}
	if (data.artifactPatterns !== undefined) {
		Object.assign(result, {
			artifactPatterns: parseInputStringArray(data.artifactPatterns, "artifactPatterns", true),
		});
	}
	if (data.notifyEnabled !== undefined) {
		Object.assign(result, { notifyEnabled: parseRequiredInputBoolean(data, "notifyEnabled") });
	}
	if (data.timeoutMinutes !== undefined) {
		Object.assign(result, {
			timeoutMinutes: parseInputInteger(data.timeoutMinutes, "timeoutMinutes", 1, 10_080),
		});
	}
	if (data.newFolders !== undefined) {
		Object.assign(result, { newFolders: parseInputStringArray(data.newFolders, "newFolders", true) });
	}
	if (data.skill !== undefined)
		Object.assign(result, { skill: data.skill === null ? null : parseSkill(data.skill, false) });
	return result;
}

function parseBatchProjectIdInput(value: unknown): BatchProjectIdInput {
	const input = parseInputRecord(value);
	return { projectId: parseRequiredInputString(input, "projectId") };
}

function parseBatchTaskIdInput(value: unknown): BatchTaskIdInput {
	const input = parseInputRecord(value);
	return {
		projectId: parseRequiredInputString(input, "projectId"),
		taskId: parseRequiredInputString(input, "taskId"),
	};
}

function parseBatchTaskIdsInput(value: unknown): BatchTaskIdsInput {
	const input = parseInputRecord(value);
	return {
		projectId: parseRequiredInputString(input, "projectId"),
		taskIds: parseInputStringArray(input.taskIds, "taskIds", true),
	};
}

function parseBatchTaskResumeInput(value: unknown): BatchTaskResumeInput {
	const input = parseInputRecord(value);
	return {
		projectId: parseRequiredInputString(input, "projectId"),
		taskId: parseRequiredInputString(input, "taskId"),
		text: parseInputString(input.text, "text"),
	};
}

function parseBatchProjectCreateInput(value: unknown): BatchProjectCreateInput {
	const input = parseInputRecord(value);
	return { data: parseBatchProjectCreateData(input.data) };
}

function parseBatchProjectUpdateInput(value: unknown): BatchProjectUpdateInput {
	const input = parseInputRecord(value);
	return {
		projectId: parseRequiredInputString(input, "projectId"),
		data: parseBatchProjectUpdateData(input.data),
	};
}

function parseBatchTaskCommandResult(value: unknown): BatchTaskCommandResult {
	const result = parseOutputRecord(value);
	const status = result.status;
	if (typeof status !== "string" || !Object.values(BATCH_COMMAND_STATUSES).includes(status as BatchCommandStatus)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Batch command status is invalid");
	}
	return {
		status: status as BatchCommandStatus,
		projectId: parseRequiredOutputString(result, "projectId"),
		affectedTaskIds: parseOutputStringArray(result.affectedTaskIds, "affectedTaskIds"),
		queuedTaskIds: parseOutputStringArray(result.queuedTaskIds, "queuedTaskIds"),
	};
}

export const DOMAIN_BATCH_TASK_CAPABILITIES = {
	LIST_PROJECTS: defineCapability<Record<string, never>, BatchProject[]>({
		id: "cap.domain.vetta.batch-task.project.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseBatchProjects,
	}),
	GET_PROJECT: defineCapability<BatchProjectIdInput, BatchProject>({
		id: "cap.domain.vetta.batch-task.project.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchProject,
	}),
	CREATE_PROJECT: defineCapability<BatchProjectCreateInput, BatchProject>({
		id: "cap.domain.vetta.batch-task.project.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectCreateInput,
		parseOutput: parseBatchProject,
	}),
	UPDATE_PROJECT: defineCapability<BatchProjectUpdateInput, BatchProject>({
		id: "cap.domain.vetta.batch-task.project.update",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectUpdateInput,
		parseOutput: parseBatchProject,
	}),
	DELETE_PROJECT: defineCapability<BatchProjectIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RUN_TASK: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.run",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RETRY_TASK: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.retry",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	STOP_TASK: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.stop",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	DELETE_TASK: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RESUME_TASK: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.resume",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RESUME_TASK_WITH_TEXT: defineCapability<BatchTaskResumeInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.resume-with-text",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskResumeInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	DELETE_TASK_SESSION: defineCapability<BatchTaskIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.task.session.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	DELETE_ALL_TASKS: defineCapability<BatchProjectIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.task.delete-all",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	START_PROJECT: defineCapability<BatchProjectIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.start",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	STOP_PROJECT: defineCapability<BatchProjectIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.stop",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RESET_PROJECT: defineCapability<BatchProjectIdInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.reset",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchProjectIdInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
	RESET_FAILED_TASKS: defineCapability<BatchTaskIdsInput, BatchTaskCommandResult>({
		id: "cap.domain.vetta.batch-task.project.failed-task.reset",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseBatchTaskIdsInput,
		parseOutput: parseBatchTaskCommandResult,
	}),
} as const;
