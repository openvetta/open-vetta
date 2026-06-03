import { readFile } from "node:fs/promises";
import { type ActionRpcEndpoint, getActionRpcEndpointFilePath } from "@vetta/action-rpc";

export function getActionServerEndpointFilePath(): string {
	return getActionRpcEndpointFilePath();
}

function isActionRpcEndpoint(value: unknown): value is ActionRpcEndpoint {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Record<string, unknown>;
	return record.transport === "http" && typeof record.url === "string" && typeof record.token === "string";
}

export async function readActionServerEndpoint(): Promise<ActionRpcEndpoint> {
	const endpointFilePath = getActionServerEndpointFilePath();
	const raw = await readFile(endpointFilePath, "utf8");
	const parsed = JSON.parse(raw) as unknown;
	if (!isActionRpcEndpoint(parsed)) {
		throw new Error(`Invalid action server endpoint file: ${endpointFilePath}`);
	}
	return parsed;
}
