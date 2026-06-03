import { writeSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
	type ActionRpcEndpoint,
	ActionRpcError,
	createActionRpcClient,
	getActionRpcEndpointFilePath,
} from "@vetta/action-rpc";

type ActionCommand =
	| { type: "help" }
	| { type: "error"; code: string; exitCode: number; message: string }
	| { type: "search"; query?: string; domain?: string }
	| { type: "describe"; actionId: string }
	| { type: "run"; actionId: string; input: unknown };

const HELP_TEXT = `Vetta action command line interface

Usage:
  vetta action search [query] [--domain <domain>]
  vetta action describe <action-id>
  vetta action run <action-id> [json-input]
  vetta action -h
  vetta action --help

Description:
  Connect to the running Vetta GUI process and invoke its local action RPC
  server. The GUI must already be running.

Output:
  stdout contains one JSON object:
    {"ok":true,"result":...}
    {"ok":false,"error":{"code":"...","message":"..."}}
`;

function writeJson(response: unknown): void {
	writeSync(1, `${JSON.stringify(response)}\n`);
}

function parseJsonInput(raw: string | undefined): ActionCommand | unknown {
	if (raw === undefined) return {};
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return {
			type: "error",
			code: "ARGUMENT_ERROR",
			exitCode: 2,
			message: "json-input must be valid JSON",
		} satisfies ActionCommand;
	}
}

function isActionErrorCommand(value: unknown): value is Extract<ActionCommand, { type: "error" }> {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		value.type === "error" &&
		"code" in value &&
		"exitCode" in value &&
		"message" in value
	);
}

function parseSearchOptions(args: string[]): ActionCommand {
	let query: string | undefined;
	let domain: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--domain") {
			const value = args[++i];
			if (!value) {
				return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: "--domain requires a value" };
			}
			domain = value;
			continue;
		}
		if (arg.startsWith("-")) {
			return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: `Unknown option: ${arg}` };
		}
		if (query !== undefined) {
			return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: `Unexpected argument: ${arg}` };
		}
		query = arg;
	}
	return { type: "search", query, domain };
}

export function parseActionCommand(args: string[]): ActionCommand | undefined {
	if (args[0] !== "action") return undefined;
	const subcommand = args[1];
	if (subcommand === undefined || subcommand === "-h" || subcommand === "--help") {
		return { type: "help" };
	}
	if (subcommand === "search") {
		return parseSearchOptions(args.slice(2));
	}
	if (subcommand === "describe") {
		const actionId = args[2];
		if (!actionId) return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: "Missing <action-id>" };
		if (args.length > 3) {
			return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: `Unexpected argument: ${args[3]}` };
		}
		return { type: "describe", actionId };
	}
	if (subcommand === "run") {
		const actionId = args[2];
		if (!actionId) return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: "Missing <action-id>" };
		if (args.length > 4) {
			return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message: `Unexpected argument: ${args[4]}` };
		}
		const input = parseJsonInput(args[3]);
		if (isActionErrorCommand(input)) return input;
		return { type: "run", actionId, input };
	}
	return {
		type: "error",
		code: "ARGUMENT_ERROR",
		exitCode: 2,
		message: `Unknown action subcommand: ${subcommand}`,
	};
}

function isActionEndpoint(value: unknown): value is ActionRpcEndpoint {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return record.transport === "http" && typeof record.url === "string" && typeof record.token === "string";
}

async function readActionEndpoint(): Promise<ActionRpcEndpoint> {
	const endpointFilePath = getActionRpcEndpointFilePath();
	const raw = await readFile(endpointFilePath, "utf8");
	const endpoint = JSON.parse(raw) as unknown;
	if (!isActionEndpoint(endpoint)) {
		throw new Error(`Invalid action server endpoint file: ${endpointFilePath}`);
	}
	return endpoint;
}

function isConnectionError(error: unknown): boolean {
	return error instanceof Error && (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed"));
}

export async function runActionCommand(command: ActionCommand): Promise<number> {
	if (command.type === "help") {
		writeSync(1, HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		writeJson({ ok: false, error: { code: command.code, message: command.message } });
		return command.exitCode;
	}

	try {
		const client = createActionRpcClient(await readActionEndpoint());
		const result =
			command.type === "search"
				? await client.search({ query: command.query, domain: command.domain })
				: command.type === "describe"
					? await client.describe(command.actionId)
					: await client.run(command.actionId, command.input);
		writeJson({ ok: true, result });
		return 0;
	} catch (error) {
		if (error instanceof ActionRpcError) {
			writeJson({ ok: false, error: { code: error.code, message: error.message } });
			return 4;
		}
		const message = error instanceof Error ? error.message : String(error);
		const code = isConnectionError(error) ? "ACTION_SERVER_UNREACHABLE" : "ACTION_SERVER_NOT_FOUND";
		writeJson({ ok: false, error: { code, message } });
		return 3;
	}
}
