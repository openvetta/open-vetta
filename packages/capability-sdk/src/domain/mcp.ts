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
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const MCP_SERVER_TYPES = {
	STDIO: "stdio",
	HTTP: "http",
} as const;

export type McpServerType = (typeof MCP_SERVER_TYPES)[keyof typeof MCP_SERVER_TYPES];

export interface McpServerSummary {
	name: string;
	type: McpServerType;
	disabled: boolean;
	command?: string;
	url?: string;
}

export interface McpServerDetail {
	name: string;
	type: McpServerType;
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
	url?: string;
	headers?: Record<string, string>;
	disabled: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
}

interface McpServerCommonUpsertData {
	disabled?: boolean;
	autoApprove?: string[];
	startupTimeout?: number;
	debug?: boolean;
}

export interface McpStdioServerUpsertData extends McpServerCommonUpsertData {
	type?: "stdio";
	command?: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface McpHttpServerUpsertData extends McpServerCommonUpsertData {
	type: "http";
	url?: string;
	headers?: Record<string, string>;
}

export type McpServerUpsertData = McpStdioServerUpsertData | McpHttpServerUpsertData;

export interface McpServerNameInput {
	name: string;
}

export interface McpServerUpsertInput {
	name: string;
	data: McpServerUpsertData;
}

export interface McpServerSetEnabledInput {
	name: string;
	enabled: boolean;
}

const COMMON_UPSERT_KEYS = new Set(["type", "disabled", "autoApprove", "startupTimeout", "debug"]);
const STDIO_UPSERT_KEYS = new Set([...COMMON_UPSERT_KEYS, "command", "args", "env", "cwd"]);
const HTTP_UPSERT_KEYS = new Set([...COMMON_UPSERT_KEYS, "url", "headers"]);

function invalidInput(message: string): never {
	throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, message);
}

function invalidOutput(message: string): never {
	throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, message);
}

function assertAllowedInputKeys(record: Record<string, unknown>, allowed: ReadonlySet<string>): void {
	for (const key of Object.keys(record)) {
		if (!allowed.has(key)) invalidInput(`Capability field data.${key} is not supported`);
	}
}

function parseOptionalInputText(record: Record<string, unknown>, field: string): string | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "string") invalidInput(`Capability field ${field} must be a string`);
	return value;
}

function parseOptionalInputBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") invalidInput(`Capability field ${field} must be a boolean`);
	return value;
}

function parseOptionalOutputBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") invalidOutput(`Capability output ${field} must be a boolean`);
	return value;
}

function parseOptionalInputPositiveInteger(record: Record<string, unknown>, field: string): number | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
		invalidInput(`Capability field ${field} must be a positive integer`);
	}
	return value;
}

function parseStringArray(
	value: unknown,
	code: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
	field: string,
): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		throw new CapabilityError(code, `Capability ${field} must be an array of strings`);
	}
	return [...value];
}

function parseStringMap(
	value: unknown,
	code: typeof CAPABILITY_ERROR_CODES.INVALID_INPUT | typeof CAPABILITY_ERROR_CODES.INVALID_OUTPUT,
	field: string,
): Record<string, string> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new CapabilityError(code, `Capability ${field} must be a string map`);
	}
	const result: Record<string, string> = {};
	for (const [key, entry] of Object.entries(value)) {
		if (typeof entry !== "string") {
			throw new CapabilityError(code, `Capability ${field}.${key} must be a string`);
		}
		result[key] = entry;
	}
	return result;
}

function parseOutputServerType(record: Record<string, unknown>): McpServerType {
	const type = parseRequiredOutputString(record, "type");
	if (type !== MCP_SERVER_TYPES.STDIO && type !== MCP_SERVER_TYPES.HTTP) {
		invalidOutput("Capability output type must be stdio or http");
	}
	return type;
}

function parseServerSummary(value: unknown): McpServerSummary {
	const output = parseOutputRecord(value);
	const command = parseOptionalOutputString(output, "command");
	const url = parseOptionalOutputString(output, "url");
	return {
		name: parseRequiredOutputString(output, "name"),
		type: parseOutputServerType(output),
		disabled: parseRequiredOutputBoolean(output, "disabled"),
		...(command === undefined ? {} : { command }),
		...(url === undefined ? {} : { url }),
	};
}

function parseServerListOutput(value: unknown): McpServerSummary[] {
	if (!Array.isArray(value)) invalidOutput("Capability output must be an array");
	return value.map((entry) => parseServerSummary(entry));
}

function parseServerDetail(value: unknown): McpServerDetail {
	const output = parseOutputRecord(value);
	const command = parseOptionalOutputString(output, "command");
	const args =
		output.args === undefined
			? undefined
			: parseStringArray(output.args, CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "output args");
	const env =
		output.env === undefined
			? undefined
			: parseStringMap(output.env, CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "output env");
	const cwd = parseOptionalOutputString(output, "cwd");
	const url = parseOptionalOutputString(output, "url");
	const headers =
		output.headers === undefined
			? undefined
			: parseStringMap(output.headers, CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "output headers");
	const autoApprove =
		output.autoApprove === undefined
			? undefined
			: parseStringArray(output.autoApprove, CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "output autoApprove");
	const startupTimeout = parseOptionalOutputNumber(output, "startupTimeout");
	const debug = parseOptionalOutputBoolean(output, "debug");
	return {
		name: parseRequiredOutputString(output, "name"),
		type: parseOutputServerType(output),
		disabled: parseRequiredOutputBoolean(output, "disabled"),
		...(command === undefined ? {} : { command }),
		...(args === undefined ? {} : { args }),
		...(env === undefined ? {} : { env }),
		...(cwd === undefined ? {} : { cwd }),
		...(url === undefined ? {} : { url }),
		...(headers === undefined ? {} : { headers }),
		...(autoApprove === undefined ? {} : { autoApprove }),
		...(startupTimeout === undefined ? {} : { startupTimeout }),
		...(debug === undefined ? {} : { debug }),
	};
}

function parseServerNameInput(value: unknown): McpServerNameInput {
	const input = parseInputRecord(value);
	return { name: parseRequiredInputString(input, "name") };
}

function parseServerUpsertData(value: unknown): McpServerUpsertData {
	const data = parseInputRecord(value);
	const type = data.type;
	if (type !== undefined && type !== MCP_SERVER_TYPES.STDIO && type !== MCP_SERVER_TYPES.HTTP) {
		invalidInput("Capability field data.type must be stdio or http");
	}
	const disabled = parseOptionalInputBoolean(data, "disabled");
	const autoApprove =
		data.autoApprove === undefined
			? undefined
			: parseStringArray(data.autoApprove, CAPABILITY_ERROR_CODES.INVALID_INPUT, "field data.autoApprove");
	const startupTimeout = parseOptionalInputPositiveInteger(data, "startupTimeout");
	const debug = parseOptionalInputBoolean(data, "debug");
	const common = {
		...(disabled === undefined ? {} : { disabled }),
		...(autoApprove === undefined ? {} : { autoApprove }),
		...(startupTimeout === undefined ? {} : { startupTimeout }),
		...(debug === undefined ? {} : { debug }),
	};
	if (type === MCP_SERVER_TYPES.HTTP) {
		assertAllowedInputKeys(data, HTTP_UPSERT_KEYS);
		const url = parseOptionalInputText(data, "url");
		const headers =
			data.headers === undefined
				? undefined
				: parseStringMap(data.headers, CAPABILITY_ERROR_CODES.INVALID_INPUT, "field data.headers");
		return {
			type,
			...common,
			...(url === undefined ? {} : { url }),
			...(headers === undefined ? {} : { headers }),
		};
	}
	assertAllowedInputKeys(data, STDIO_UPSERT_KEYS);
	const command = parseOptionalInputText(data, "command");
	const args =
		data.args === undefined
			? undefined
			: parseStringArray(data.args, CAPABILITY_ERROR_CODES.INVALID_INPUT, "field data.args");
	const env =
		data.env === undefined
			? undefined
			: parseStringMap(data.env, CAPABILITY_ERROR_CODES.INVALID_INPUT, "field data.env");
	const cwd = parseOptionalInputText(data, "cwd");
	return {
		...(type === MCP_SERVER_TYPES.STDIO ? { type } : {}),
		...common,
		...(command === undefined ? {} : { command }),
		...(args === undefined ? {} : { args }),
		...(env === undefined ? {} : { env }),
		...(cwd === undefined ? {} : { cwd }),
	};
}

function parseServerUpsertInput(value: unknown): McpServerUpsertInput {
	const input = parseInputRecord(value);
	return {
		name: parseRequiredInputString(input, "name"),
		data: parseServerUpsertData(input.data),
	};
}

function parseServerSetEnabledInput(value: unknown): McpServerSetEnabledInput {
	const input = parseInputRecord(value);
	return {
		name: parseRequiredInputString(input, "name"),
		enabled: parseRequiredInputBoolean(input, "enabled"),
	};
}

export const DOMAIN_MCP_CAPABILITIES = {
	LIST_SERVERS: defineCapability<Record<string, never>, McpServerSummary[]>({
		id: "cap.domain.vetta.mcp.server.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseServerListOutput,
	}),
	GET_SERVER: defineCapability<McpServerNameInput, McpServerDetail>({
		id: "cap.domain.vetta.mcp.server.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseServerNameInput,
		parseOutput: parseServerDetail,
	}),
	UPSERT_SERVER: defineCapability<McpServerUpsertInput, McpServerDetail>({
		id: "cap.domain.vetta.mcp.server.upsert",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseServerUpsertInput,
		parseOutput: parseServerDetail,
	}),
	SET_SERVER_ENABLED: defineCapability<McpServerSetEnabledInput, undefined>({
		id: "cap.domain.vetta.mcp.server.set-enabled",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseServerSetEnabledInput,
		parseOutput: parseVoidOutput,
	}),
	REMOVE_SERVER: defineCapability<McpServerNameInput, undefined>({
		id: "cap.domain.vetta.mcp.server.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseServerNameInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
