import { homedir } from "node:os";
import { join } from "node:path";

export const ACTION_RPC_ENDPOINT_FILE_ENV = "VETTA_ACTION_RPC_ENDPOINT_FILE";
export const VETTA_HOME_ENV = "VETTA_HOME";

export function getVettaHomePath(): string {
	return process.env[VETTA_HOME_ENV] || join(homedir(), ".vetta");
}

export function getActionRpcEndpointFilePath(): string {
	const envPath = process.env[ACTION_RPC_ENDPOINT_FILE_ENV];
	if (envPath) return envPath;
	return join(getVettaHomePath(), "action-server.json");
}
