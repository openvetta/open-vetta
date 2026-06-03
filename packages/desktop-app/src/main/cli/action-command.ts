import { writeSync } from "node:fs";
import { ActionRpcError, createActionRpcClient } from "@vetta/action-rpc";
import { readActionServerEndpoint } from "../app-actions/endpoint-file.js";

export type ActionCliCommand =
	| { type: "help" }
	| { type: "error"; code: string; exitCode: number; message: string }
	| { type: "search"; query?: string; domain?: string }
	| { type: "describe"; actionId: string }
	| { type: "run"; actionId: string; input: unknown };

interface ActionCliResponse {
	ok: boolean;
	result?: unknown;
	error?: {
		code: string;
		message: string;
	};
}

const HELP_TEXT = `Vetta action command line interface

Usage:
  Vetta.exe action search [query] [--domain <domain>]
  Vetta.exe action describe <action-id>
  Vetta.exe action run <action-id> [json-input]
  Vetta.exe action -h
  Vetta.exe action --help

Description:
  Connect to the running Vetta GUI process and invoke its local action RPC
  server. The GUI must already be running.

Output:
  stdout contains one JSON object:
    {"ok":true,"result":...}
    {"ok":false,"error":{"code":"...","message":"..."}}

Exit codes:
  0  Success or help displayed.
  2  Invalid command line arguments.
  3  Running GUI action server not found or unreachable.
  4  Action RPC error.
`;

class ActionCliError extends Error {
	constructor(
		readonly code: string,
		readonly exitCode: number,
		message: string,
	) {
		super(message);
		this.name = "ActionCliError";
	}
}

function findCommandStart(argv: string[]): number {
	return argv.indexOf("action");
}

function parseSearchOptions(args: string[]): Extract<ActionCliCommand, { type: "search" }> {
	let query: string | undefined;
	let domain: string | undefined;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--domain") {
			const value = args[++i];
			if (!value) throw new ActionCliError("ARGUMENT_ERROR", 2, "--domain requires a value");
			domain = value;
			continue;
		}
		if (arg.startsWith("-")) {
			throw new ActionCliError("ARGUMENT_ERROR", 2, `Unknown option: ${arg}`);
		}
		if (query !== undefined) {
			throw new ActionCliError("ARGUMENT_ERROR", 2, `Unexpected argument: ${arg}`);
		}
		query = arg;
	}
	return { type: "search", query, domain };
}

function parseJsonInput(raw: string | undefined): unknown {
	if (raw === undefined) return {};
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		throw new ActionCliError("ARGUMENT_ERROR", 2, "json-input must be valid JSON");
	}
}

export function parseActionCliCommand(argv: string[]): ActionCliCommand | null {
	const start = findCommandStart(argv);
	if (start < 0) return null;
	const args = argv.slice(start + 1);
	const subcommand = args[0];

	try {
		if (subcommand === undefined || subcommand === "-h" || subcommand === "--help") {
			return { type: "help" };
		}
		if (subcommand === "search") {
			return parseSearchOptions(args.slice(1));
		}
		if (subcommand === "describe") {
			const actionId = args[1];
			if (!actionId) throw new ActionCliError("ARGUMENT_ERROR", 2, "Missing <action-id>");
			if (args.length > 2) throw new ActionCliError("ARGUMENT_ERROR", 2, `Unexpected argument: ${args[2]}`);
			return { type: "describe", actionId };
		}
		if (subcommand === "run") {
			const actionId = args[1];
			if (!actionId) throw new ActionCliError("ARGUMENT_ERROR", 2, "Missing <action-id>");
			if (args.length > 3) throw new ActionCliError("ARGUMENT_ERROR", 2, `Unexpected argument: ${args[3]}`);
			return { type: "run", actionId, input: parseJsonInput(args[2]) };
		}
		return {
			type: "error",
			code: "ARGUMENT_ERROR",
			exitCode: 2,
			message: `Unknown action subcommand: ${subcommand}`,
		};
	} catch (error) {
		if (error instanceof ActionCliError) {
			return { type: "error", code: error.code, exitCode: error.exitCode, message: error.message };
		}
		const message = error instanceof Error ? error.message : String(error);
		return { type: "error", code: "ARGUMENT_ERROR", exitCode: 2, message };
	}
}

function writeJson(response: ActionCliResponse): void {
	writeSync(1, `${JSON.stringify(response)}\n`);
}

function isConnectionError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed");
}

export async function runActionCliCommand(command: ActionCliCommand): Promise<number> {
	if (command.type === "help") {
		writeSync(1, HELP_TEXT);
		return 0;
	}
	if (command.type === "error") {
		writeJson({ ok: false, error: { code: command.code, message: command.message } });
		return command.exitCode;
	}

	try {
		const client = createActionRpcClient(await readActionServerEndpoint());
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
