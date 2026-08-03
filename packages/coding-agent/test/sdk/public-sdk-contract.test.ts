import { describe, expect, it } from "vitest";
import {
	type AgentSession,
	type CreateAgentSessionOptions,
	type CreateAgentSessionResult,
	createAgentSession,
	type RunRpcModeOptions,
	runRpcMode,
} from "../../src/index.js";

describe("public SDK contract", () => {
	it("keeps the package-root factory and Legacy RPC compatibility signatures", () => {
		const factory: (options?: CreateAgentSessionOptions) => Promise<CreateAgentSessionResult> = createAgentSession;
		const rpc: (session: AgentSession, options?: RunRpcModeOptions) => Promise<never> = runRpcMode;

		expect(factory).toBe(createAgentSession);
		expect(rpc).toBe(runRpcMode);
	});
});
