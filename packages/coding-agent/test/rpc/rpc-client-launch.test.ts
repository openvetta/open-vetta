import { describe, expect, it } from "vitest";
import { resolveRpcClientProcessLaunch } from "../../src/modes/rpc/rpc-client.js";

describe("RpcClient process launch", () => {
	it("uses the canonical installed RPC executable by default", () => {
		expect(resolveRpcClientProcessLaunch(undefined, ["--mode", "rpc"])).toEqual({
			command: "vetta-agent-rpc",
			args: ["--mode", "rpc"],
		});
	});

	it("preserves explicit JavaScript entry paths for compatibility", () => {
		expect(resolveRpcClientProcessLaunch("custom-agent.js", ["--mode", "rpc"])).toEqual({
			command: "node",
			args: ["custom-agent.js", "--mode", "rpc"],
		});
	});
});
