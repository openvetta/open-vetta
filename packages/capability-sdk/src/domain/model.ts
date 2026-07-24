import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputNumber,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputNumber,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export interface ModelSummary {
	id: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
}

export interface ModelProviderSummary {
	id: string;
	displayName: string;
	baseUrl?: string;
	api?: string;
	hasApiKey: boolean;
	modelCount: number;
	models: ModelSummary[];
}

export interface ModelListResult {
	defaultModel: string | null;
	providers: ModelProviderSummary[];
}

export interface ModelCost {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface ModelDefinitionDetail {
	id: string;
	modelId?: string;
	name?: string;
	api?: string;
	reasoning?: boolean;
	reasoningLevels?: string[];
	defaultReasoningLevel?: string;
	input?: string[];
	contextWindow?: number;
	maxTokens?: number;
	cost?: ModelCost;
}

export interface ModelProviderConfigSnapshot {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	displayName?: string;
	authHeader?: boolean;
	headers?: Record<string, string>;
	models?: ModelDefinitionDetail[];
}

export interface ModelConfigSnapshot {
	defaultModel?: string;
	providers: Record<string, ModelProviderConfigSnapshot>;
}

export interface ModelProviderInput {
	provider: string;
}

export interface ModelProviderDetail extends ModelProviderConfigSnapshot {
	provider: string;
}

export interface ModelProbeInput {
	provider: string;
	model: string;
}

export interface ModelProbeResult {
	ok: boolean;
	message?: string;
	error?: string;
}

export interface ModelKeyValidationInput {
	modelKey: string;
	operation?: string;
}

export interface ModelDefaultInput {
	modelKey: string;
}

export interface ModelDefaultResult {
	defaultModel: string;
}

export interface ModelProviderUpsertData {
	baseUrl?: string;
	apiKey?: string;
	api?: string;
	displayName?: string;
	authHeader?: boolean;
	headers?: Record<string, string>;
	models?: Array<{
		id: string;
		name?: string;
		api?: string;
		reasoning?: boolean;
		contextWindow?: number;
		maxTokens?: number;
	}>;
}

export interface ModelProviderUpsertInput {
	provider: string;
	data: ModelProviderUpsertData;
}

function invalidInput(message: string): never {
	throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, message);
}

function invalidOutput(message: string): never {
	throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, message);
}

function parseOptionalInputBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") invalidInput(`Capability field ${field} must be a boolean`);
	return value;
}

function parseOptionalInputText(record: Record<string, unknown>, field: string): string | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "string") invalidInput(`Capability field ${field} must be a string`);
	return value;
}

function parseOptionalOutputBoolean(record: Record<string, unknown>, field: string): boolean | undefined {
	const value = record[field];
	if (value === undefined) return undefined;
	if (typeof value !== "boolean") invalidOutput(`Capability output ${field} must be a boolean`);
	return value;
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

function parseOutputStringArray(value: unknown, field: string): string[] {
	if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
		invalidOutput(`Capability output ${field} must be an array of strings`);
	}
	return [...value];
}

function parseModelCost(value: unknown): ModelCost {
	const cost = parseOutputRecord(value);
	return {
		input: parseRequiredOutputNumber(cost, "input"),
		output: parseRequiredOutputNumber(cost, "output"),
		cacheRead: parseRequiredOutputNumber(cost, "cacheRead"),
		cacheWrite: parseRequiredOutputNumber(cost, "cacheWrite"),
	};
}

function parseModelDefinitionOutput(value: unknown): ModelDefinitionDetail {
	const model = parseOutputRecord(value);
	const modelId = parseOptionalOutputString(model, "modelId");
	const name = parseOptionalOutputString(model, "name");
	const api = parseOptionalOutputString(model, "api");
	const reasoning = parseOptionalOutputBoolean(model, "reasoning");
	const reasoningLevels =
		model.reasoningLevels === undefined
			? undefined
			: parseOutputStringArray(model.reasoningLevels, "model.reasoningLevels");
	const defaultReasoningLevel = parseOptionalOutputString(model, "defaultReasoningLevel");
	const input = model.input === undefined ? undefined : parseOutputStringArray(model.input, "model.input");
	const contextWindow = parseOptionalOutputNumber(model, "contextWindow");
	const maxTokens = parseOptionalOutputNumber(model, "maxTokens");
	const cost = model.cost === undefined ? undefined : parseModelCost(model.cost);
	return {
		id: parseRequiredOutputString(model, "id"),
		...(modelId === undefined ? {} : { modelId }),
		...(name === undefined ? {} : { name }),
		...(api === undefined ? {} : { api }),
		...(reasoning === undefined ? {} : { reasoning }),
		...(reasoningLevels === undefined ? {} : { reasoningLevels }),
		...(defaultReasoningLevel === undefined ? {} : { defaultReasoningLevel }),
		...(input === undefined ? {} : { input }),
		...(contextWindow === undefined ? {} : { contextWindow }),
		...(maxTokens === undefined ? {} : { maxTokens }),
		...(cost === undefined ? {} : { cost }),
	};
}

function parseProviderConfigOutput(value: unknown): ModelProviderConfigSnapshot {
	const provider = parseOutputRecord(value);
	const baseUrl = parseOptionalOutputString(provider, "baseUrl");
	const apiKey = parseOptionalOutputString(provider, "apiKey");
	const api = parseOptionalOutputString(provider, "api");
	const displayName = parseOptionalOutputString(provider, "displayName");
	const authHeader = parseOptionalOutputBoolean(provider, "authHeader");
	const headers =
		provider.headers === undefined
			? undefined
			: parseStringMap(provider.headers, CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "output headers");
	if (provider.models !== undefined && !Array.isArray(provider.models)) {
		invalidOutput("Capability output models must be an array");
	}
	const models =
		provider.models === undefined ? undefined : provider.models.map((model) => parseModelDefinitionOutput(model));
	return {
		...(baseUrl === undefined ? {} : { baseUrl }),
		...(apiKey === undefined ? {} : { apiKey }),
		...(api === undefined ? {} : { api }),
		...(displayName === undefined ? {} : { displayName }),
		...(authHeader === undefined ? {} : { authHeader }),
		...(headers === undefined ? {} : { headers }),
		...(models === undefined ? {} : { models }),
	};
}

function parseModelSummary(value: unknown): ModelSummary {
	const model = parseOutputRecord(value);
	const name = parseOptionalOutputString(model, "name");
	const api = parseOptionalOutputString(model, "api");
	const reasoning = parseOptionalOutputBoolean(model, "reasoning");
	return {
		id: parseRequiredOutputString(model, "id"),
		...(name === undefined ? {} : { name }),
		...(api === undefined ? {} : { api }),
		...(reasoning === undefined ? {} : { reasoning }),
	};
}

function parseModelProviderSummary(value: unknown): ModelProviderSummary {
	const provider = parseOutputRecord(value);
	if (!Array.isArray(provider.models)) invalidOutput("Capability output provider.models must be an array");
	const baseUrl = parseOptionalOutputString(provider, "baseUrl");
	const api = parseOptionalOutputString(provider, "api");
	return {
		id: parseRequiredOutputString(provider, "id"),
		displayName: parseRequiredOutputString(provider, "displayName"),
		...(baseUrl === undefined ? {} : { baseUrl }),
		...(api === undefined ? {} : { api }),
		hasApiKey: parseRequiredOutputBoolean(provider, "hasApiKey"),
		modelCount: parseRequiredOutputNumber(provider, "modelCount"),
		models: provider.models.map((model) => parseModelSummary(model)),
	};
}

function parseModelListResult(value: unknown): ModelListResult {
	const result = parseOutputRecord(value);
	if (result.defaultModel !== null && typeof result.defaultModel !== "string") {
		invalidOutput("Capability output defaultModel must be a string or null");
	}
	if (!Array.isArray(result.providers)) invalidOutput("Capability output providers must be an array");
	return {
		defaultModel: result.defaultModel,
		providers: result.providers.map((provider) => parseModelProviderSummary(provider)),
	};
}

function parseModelConfigSnapshot(value: unknown): ModelConfigSnapshot {
	const snapshot = parseOutputRecord(value);
	const defaultModel = parseOptionalOutputString(snapshot, "defaultModel");
	const providers = parseOutputRecord(snapshot.providers);
	const parsedProviders: Record<string, ModelProviderConfigSnapshot> = {};
	for (const [provider, config] of Object.entries(providers)) {
		parsedProviders[provider] = parseProviderConfigOutput(config);
	}
	return {
		...(defaultModel === undefined ? {} : { defaultModel }),
		providers: parsedProviders,
	};
}

function parseProviderInput(value: unknown): ModelProviderInput {
	const input = parseInputRecord(value);
	return { provider: parseRequiredInputString(input, "provider") };
}

function parseProviderDetail(value: unknown): ModelProviderDetail {
	const output = parseOutputRecord(value);
	return {
		provider: parseRequiredOutputString(output, "provider"),
		...parseProviderConfigOutput(output),
	};
}

function parseProbeInput(value: unknown): ModelProbeInput {
	const input = parseInputRecord(value);
	return {
		provider: parseRequiredInputString(input, "provider"),
		model: parseRequiredInputString(input, "model"),
	};
}

function parseProbeResult(value: unknown): ModelProbeResult {
	const output = parseOutputRecord(value);
	const message = parseOptionalOutputString(output, "message");
	const error = parseOptionalOutputString(output, "error");
	return {
		ok: parseRequiredOutputBoolean(output, "ok"),
		...(message === undefined ? {} : { message }),
		...(error === undefined ? {} : { error }),
	};
}

function parseModelKeyValidationInput(value: unknown): ModelKeyValidationInput {
	const input = parseInputRecord(value);
	const operation = parseOptionalInputText(input, "operation");
	return {
		modelKey: parseRequiredInputString(input, "modelKey"),
		...(operation === undefined ? {} : { operation }),
	};
}

function parseModelDefaultInput(value: unknown): ModelDefaultInput {
	const input = parseInputRecord(value);
	return { modelKey: parseRequiredInputString(input, "modelKey") };
}

function parseModelDefaultResult(value: unknown): ModelDefaultResult {
	const output = parseOutputRecord(value);
	return { defaultModel: parseRequiredOutputString(output, "defaultModel") };
}

function parseProviderUpsertModel(value: unknown): NonNullable<ModelProviderUpsertData["models"]>[number] {
	const model = parseInputRecord(value);
	const name = parseOptionalInputText(model, "name");
	const api = parseOptionalInputText(model, "api");
	const reasoning = parseOptionalInputBoolean(model, "reasoning");
	const contextWindow = model.contextWindow;
	const maxTokens = model.maxTokens;
	if (contextWindow !== undefined && (typeof contextWindow !== "number" || !Number.isFinite(contextWindow))) {
		invalidInput("Capability field models.contextWindow must be a number");
	}
	if (maxTokens !== undefined && (typeof maxTokens !== "number" || !Number.isFinite(maxTokens))) {
		invalidInput("Capability field models.maxTokens must be a number");
	}
	return {
		id: parseRequiredInputString(model, "id"),
		...(name === undefined ? {} : { name }),
		...(api === undefined ? {} : { api }),
		...(reasoning === undefined ? {} : { reasoning }),
		...(contextWindow === undefined ? {} : { contextWindow }),
		...(maxTokens === undefined ? {} : { maxTokens }),
	};
}

function parseProviderUpsertData(value: unknown): ModelProviderUpsertData {
	const data = parseInputRecord(value);
	const baseUrl = parseOptionalInputText(data, "baseUrl");
	const apiKey = parseOptionalInputText(data, "apiKey");
	const api = parseOptionalInputText(data, "api");
	const displayName = parseOptionalInputText(data, "displayName");
	const authHeader = parseOptionalInputBoolean(data, "authHeader");
	const headers =
		data.headers === undefined
			? undefined
			: parseStringMap(data.headers, CAPABILITY_ERROR_CODES.INVALID_INPUT, "field headers");
	if (data.models !== undefined && !Array.isArray(data.models)) {
		invalidInput("Capability field models must be an array");
	}
	const models = data.models === undefined ? undefined : data.models.map((model) => parseProviderUpsertModel(model));
	return {
		...(baseUrl === undefined ? {} : { baseUrl }),
		...(apiKey === undefined ? {} : { apiKey }),
		...(api === undefined ? {} : { api }),
		...(displayName === undefined ? {} : { displayName }),
		...(authHeader === undefined ? {} : { authHeader }),
		...(headers === undefined ? {} : { headers }),
		...(models === undefined ? {} : { models }),
	};
}

function parseProviderUpsertInput(value: unknown): ModelProviderUpsertInput {
	const input = parseInputRecord(value);
	return {
		provider: parseRequiredInputString(input, "provider"),
		data: parseProviderUpsertData(input.data),
	};
}

export const DOMAIN_MODEL_CAPABILITIES = {
	LIST: defineCapability<Record<string, never>, ModelListResult>({
		id: "cap.domain.vetta.model.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseModelListResult,
	}),
	GET_CONFIG: defineCapability<Record<string, never>, ModelConfigSnapshot>({
		id: "cap.domain.vetta.model.config.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseModelConfigSnapshot,
	}),
	GET_PROVIDER: defineCapability<ModelProviderInput, ModelProviderDetail>({
		id: "cap.domain.vetta.model.provider.get",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProviderInput,
		parseOutput: parseProviderDetail,
	}),
	PROBE: defineCapability<ModelProbeInput, ModelProbeResult>({
		id: "cap.domain.vetta.model.probe",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProbeInput,
		parseOutput: parseProbeResult,
	}),
	VALIDATE_KEY: defineCapability<ModelKeyValidationInput, undefined>({
		id: "cap.domain.vetta.model.key.validate",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseModelKeyValidationInput,
		parseOutput: parseVoidOutput,
	}),
	SET_DEFAULT: defineCapability<ModelDefaultInput, ModelDefaultResult>({
		id: "cap.domain.vetta.model.default.set",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseModelDefaultInput,
		parseOutput: parseModelDefaultResult,
	}),
	UPSERT_PROVIDER: defineCapability<ModelProviderUpsertInput, ModelProviderConfigSnapshot>({
		id: "cap.domain.vetta.model.provider.upsert",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProviderUpsertInput,
		parseOutput: parseProviderConfigOutput,
	}),
	REMOVE_PROVIDER: defineCapability<ModelProviderInput, undefined>({
		id: "cap.domain.vetta.model.provider.remove",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseProviderInput,
		parseOutput: parseVoidOutput,
	}),
} as const;
