import { CAPABILITY_ERROR_CODES, CAPABILITY_LAYERS, CapabilityError, defineCapability } from "../contracts.js";
import {
	parseEmptyInput,
	parseInputRecord,
	parseOptionalOutputString,
	parseOutputRecord,
	parseRequiredInputBoolean,
	parseRequiredInputString,
	parseRequiredOutputBoolean,
	parseRequiredOutputString,
	parseVoidOutput,
} from "./parse-helpers.js";

export const WEBHOOK_KINDS = {
	FEISHU: "feishu",
	DINGTALK: "dingtalk",
} as const;

export const WEBHOOK_MESSAGE_LEVELS = {
	INFO: "info",
	WARN: "warn",
	ERROR: "error",
	SUCCESS: "success",
} as const;

export type WebhookKind = (typeof WEBHOOK_KINDS)[keyof typeof WEBHOOK_KINDS];
export type WebhookMessageLevel = (typeof WEBHOOK_MESSAGE_LEVELS)[keyof typeof WEBHOOK_MESSAGE_LEVELS];

export interface WebhookFeishuOptions {
	readonly mentionAll?: boolean;
}

export interface WebhookDingtalkOptions {
	readonly mentionAll?: boolean;
	readonly atMobiles?: string[];
	readonly keyword?: string;
}

export interface WebhookEndpoint {
	readonly id: string;
	readonly kind: WebhookKind;
	readonly name: string;
	readonly enabled: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly urlMask?: string;
	readonly hasSignSecret?: boolean;
	readonly feishu?: WebhookFeishuOptions;
	readonly dingtalk?: WebhookDingtalkOptions;
}

export interface WebhookProviderDescriptor {
	readonly kind: WebhookKind;
	readonly displayName: string;
	readonly iconClass?: string;
}

export interface WebhookCreateData {
	readonly kind: WebhookKind;
	readonly name: string;
	readonly webhookUrl: string;
	readonly signSecret?: string;
	readonly enabled?: boolean;
	readonly feishu?: WebhookFeishuOptions;
	readonly dingtalk?: WebhookDingtalkOptions;
}

export interface WebhookUpdateData {
	readonly name?: string;
	readonly enabled?: boolean;
	readonly webhookUrl?: string;
	readonly signSecret?: string;
	readonly feishu?: WebhookFeishuOptions;
	readonly dingtalk?: WebhookDingtalkOptions;
}

export interface WebhookMessage {
	readonly title?: string;
	readonly text: string;
	readonly level?: WebhookMessageLevel;
}

export interface WebhookSendResult {
	readonly ok: boolean;
	readonly error?: string;
}

export interface WebhookIdInput {
	readonly id: string;
}

export interface WebhookCreateInput {
	readonly data: WebhookCreateData;
}

export interface WebhookUpdateInput {
	readonly id: string;
	readonly data: WebhookUpdateData;
}

export interface WebhookSetEnabledInput {
	readonly id: string;
	readonly enabled: boolean;
}

export interface WebhookSendInput {
	readonly id: string;
	readonly message: WebhookMessage;
}

const WEBHOOK_DATA_KEYS = new Set(["name", "enabled", "webhookUrl", "signSecret", "feishu", "dingtalk"]);

function parseInputString(value: unknown, field: string): string {
	if (typeof value !== "string") {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, `Capability field ${field} must be a string`);
	}
	return value;
}

function parseWebhookKind(value: unknown, output: boolean): WebhookKind {
	if (typeof value !== "string" || !Object.values(WEBHOOK_KINDS).includes(value as WebhookKind)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook kind is invalid",
		);
	}
	return value as WebhookKind;
}

function parseWebhookLevel(value: unknown, output: boolean): WebhookMessageLevel {
	if (typeof value !== "string" || !Object.values(WEBHOOK_MESSAGE_LEVELS).includes(value as WebhookMessageLevel)) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook message level is invalid",
		);
	}
	return value as WebhookMessageLevel;
}

function parseStringArray(value: unknown, output: boolean): string[] {
	if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook mobile list must be an array of strings",
		);
	}
	return [...value];
}

function parseFeishuOptions(value: unknown, output: boolean): WebhookFeishuOptions {
	const options = output ? parseOutputRecord(value) : parseInputRecord(value);
	if (!Object.keys(options).every((key) => key === "mentionAll")) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook Feishu options contain unknown fields",
		);
	}
	if (options.mentionAll === undefined) return {};
	if (typeof options.mentionAll !== "boolean") {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook Feishu mentionAll must be a boolean",
		);
	}
	return { mentionAll: options.mentionAll };
}

function parseDingtalkOptions(value: unknown, output: boolean): WebhookDingtalkOptions {
	const options = output ? parseOutputRecord(value) : parseInputRecord(value);
	if (!Object.keys(options).every((key) => key === "mentionAll" || key === "atMobiles" || key === "keyword")) {
		throw new CapabilityError(
			output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
			"Webhook DingTalk options contain unknown fields",
		);
	}
	const result: WebhookDingtalkOptions = {};
	if (options.mentionAll !== undefined) {
		if (typeof options.mentionAll !== "boolean") {
			throw new CapabilityError(
				output ? CAPABILITY_ERROR_CODES.INVALID_OUTPUT : CAPABILITY_ERROR_CODES.INVALID_INPUT,
				"Webhook DingTalk mentionAll must be a boolean",
			);
		}
		Object.assign(result, { mentionAll: options.mentionAll });
	}
	if (options.atMobiles !== undefined)
		Object.assign(result, { atMobiles: parseStringArray(options.atMobiles, output) });
	if (options.keyword !== undefined) {
		Object.assign(result, {
			keyword: output ? parseRequiredOutputString(options, "keyword") : parseInputString(options.keyword, "keyword"),
		});
	}
	return result;
}

function parseWebhookCreateData(value: unknown): WebhookCreateData {
	const data = parseInputRecord(value);
	const allowedKeys = new Set(["kind", ...WEBHOOK_DATA_KEYS]);
	if (!Object.keys(data).every((key) => allowedKeys.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Webhook create data contains unknown fields");
	}
	const signSecret = data.signSecret === undefined ? undefined : parseInputString(data.signSecret, "signSecret");
	const enabled = data.enabled === undefined ? undefined : parseRequiredInputBoolean(data, "enabled");
	const feishu = data.feishu === undefined ? undefined : parseFeishuOptions(data.feishu, false);
	const dingtalk = data.dingtalk === undefined ? undefined : parseDingtalkOptions(data.dingtalk, false);
	return {
		kind: parseWebhookKind(data.kind, false),
		name: parseInputString(data.name, "name"),
		webhookUrl: parseRequiredInputString(data, "webhookUrl"),
		...(signSecret === undefined ? {} : { signSecret }),
		...(enabled === undefined ? {} : { enabled }),
		...(feishu === undefined ? {} : { feishu }),
		...(dingtalk === undefined ? {} : { dingtalk }),
	};
}

function parseWebhookUpdateData(value: unknown): WebhookUpdateData {
	const data = parseInputRecord(value);
	if (Object.keys(data).length === 0 || !Object.keys(data).every((key) => WEBHOOK_DATA_KEYS.has(key))) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Webhook update fields are invalid");
	}
	const result: WebhookUpdateData = {};
	if (data.name !== undefined) Object.assign(result, { name: parseRequiredInputString(data, "name") });
	if (data.enabled !== undefined) Object.assign(result, { enabled: parseRequiredInputBoolean(data, "enabled") });
	if (data.webhookUrl !== undefined) {
		Object.assign(result, { webhookUrl: parseRequiredInputString(data, "webhookUrl") });
	}
	if (data.signSecret !== undefined) {
		Object.assign(result, { signSecret: parseInputString(data.signSecret, "signSecret") });
	}
	if (data.feishu !== undefined) Object.assign(result, { feishu: parseFeishuOptions(data.feishu, false) });
	if (data.dingtalk !== undefined) Object.assign(result, { dingtalk: parseDingtalkOptions(data.dingtalk, false) });
	return result;
}

function parseWebhookIdInput(value: unknown): WebhookIdInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id") };
}

function parseWebhookCreateInput(value: unknown): WebhookCreateInput {
	const input = parseInputRecord(value);
	return { data: parseWebhookCreateData(input.data) };
}

function parseWebhookUpdateInput(value: unknown): WebhookUpdateInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id"), data: parseWebhookUpdateData(input.data) };
}

function parseWebhookSetEnabledInput(value: unknown): WebhookSetEnabledInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id"), enabled: parseRequiredInputBoolean(input, "enabled") };
}

function parseWebhookMessage(value: unknown): WebhookMessage {
	const message = parseInputRecord(value);
	if (!Object.keys(message).every((key) => key === "title" || key === "text" || key === "level")) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_INPUT, "Webhook message contains unknown fields");
	}
	const title = message.title === undefined ? undefined : parseInputString(message.title, "title");
	const level = message.level === undefined ? undefined : parseWebhookLevel(message.level, false);
	return {
		...(title === undefined ? {} : { title }),
		text: parseInputString(message.text, "text"),
		...(level === undefined ? {} : { level }),
	};
}

function parseWebhookSendInput(value: unknown): WebhookSendInput {
	const input = parseInputRecord(value);
	return { id: parseRequiredInputString(input, "id"), message: parseWebhookMessage(input.message) };
}

function parseWebhookEndpoint(value: unknown): WebhookEndpoint {
	const endpoint = parseOutputRecord(value);
	const urlMask = parseOptionalOutputString(endpoint, "urlMask");
	const hasSignSecret =
		endpoint.hasSignSecret === undefined ? undefined : parseRequiredOutputBoolean(endpoint, "hasSignSecret");
	const feishu = endpoint.feishu === undefined ? undefined : parseFeishuOptions(endpoint.feishu, true);
	const dingtalk = endpoint.dingtalk === undefined ? undefined : parseDingtalkOptions(endpoint.dingtalk, true);
	return {
		id: parseRequiredOutputString(endpoint, "id"),
		kind: parseWebhookKind(endpoint.kind, true),
		name: parseRequiredOutputString(endpoint, "name"),
		enabled: parseRequiredOutputBoolean(endpoint, "enabled"),
		createdAt: parseRequiredOutputString(endpoint, "createdAt"),
		updatedAt: parseRequiredOutputString(endpoint, "updatedAt"),
		...(urlMask === undefined ? {} : { urlMask }),
		...(hasSignSecret === undefined ? {} : { hasSignSecret }),
		...(feishu === undefined ? {} : { feishu }),
		...(dingtalk === undefined ? {} : { dingtalk }),
	};
}

function parseWebhookEndpoints(value: unknown): WebhookEndpoint[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseWebhookEndpoint);
}

function parseWebhookProvider(value: unknown): WebhookProviderDescriptor {
	const provider = parseOutputRecord(value);
	const iconClass = parseOptionalOutputString(provider, "iconClass");
	return {
		kind: parseWebhookKind(provider.kind, true),
		displayName: parseRequiredOutputString(provider, "displayName"),
		...(iconClass === undefined ? {} : { iconClass }),
	};
}

function parseWebhookProviders(value: unknown): WebhookProviderDescriptor[] {
	if (!Array.isArray(value)) {
		throw new CapabilityError(CAPABILITY_ERROR_CODES.INVALID_OUTPUT, "Capability output must be an array");
	}
	return value.map(parseWebhookProvider);
}

function parseWebhookSendResult(value: unknown): WebhookSendResult {
	const result = parseOutputRecord(value);
	const error = parseOptionalOutputString(result, "error");
	return {
		ok: parseRequiredOutputBoolean(result, "ok"),
		...(error === undefined ? {} : { error }),
	};
}

export const DOMAIN_WEBHOOK_CAPABILITIES = {
	LIST_ENDPOINTS: defineCapability<Record<string, never>, WebhookEndpoint[]>({
		id: "cap.domain.vetta.webhook.endpoint.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseWebhookEndpoints,
	}),
	LIST_PROVIDERS: defineCapability<Record<string, never>, WebhookProviderDescriptor[]>({
		id: "cap.domain.vetta.webhook.provider.list",
		kind: "query",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseEmptyInput,
		parseOutput: parseWebhookProviders,
	}),
	CREATE_ENDPOINT: defineCapability<WebhookCreateInput, WebhookEndpoint>({
		id: "cap.domain.vetta.webhook.endpoint.create",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookCreateInput,
		parseOutput: parseWebhookEndpoint,
	}),
	UPDATE_ENDPOINT: defineCapability<WebhookUpdateInput, WebhookEndpoint>({
		id: "cap.domain.vetta.webhook.endpoint.update",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookUpdateInput,
		parseOutput: parseWebhookEndpoint,
	}),
	DELETE_ENDPOINT: defineCapability<WebhookIdInput, undefined>({
		id: "cap.domain.vetta.webhook.endpoint.delete",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookIdInput,
		parseOutput: parseVoidOutput,
	}),
	SET_ENABLED: defineCapability<WebhookSetEnabledInput, WebhookEndpoint>({
		id: "cap.domain.vetta.webhook.endpoint.set-enabled",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookSetEnabledInput,
		parseOutput: parseWebhookEndpoint,
	}),
	TEST_ENDPOINT: defineCapability<WebhookIdInput, WebhookSendResult>({
		id: "cap.domain.vetta.webhook.endpoint.test",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookIdInput,
		parseOutput: parseWebhookSendResult,
	}),
	SEND_MESSAGE: defineCapability<WebhookSendInput, WebhookSendResult>({
		id: "cap.domain.vetta.webhook.endpoint.send",
		kind: "command",
		layer: CAPABILITY_LAYERS.DOMAIN,
		version: 1,
		parseInput: parseWebhookSendInput,
		parseOutput: parseWebhookSendResult,
	}),
} as const;
