import type { CodingAgentHostBootstrap } from "@vetta/coding-agent/bootstrap";
import type { RpcRuntimeDecision } from "@vetta/coding-agent/rpc";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLegacyRuntimeExecution } from "../src/legacy-runtime-gateway.js";

const { legacyMain, legacyWithBootstrap } = vi.hoisted(() => ({
	legacyMain: vi.fn<(args: string[]) => Promise<void>>(),
	legacyWithBootstrap:
		vi.fn<
			(
				bootstrap: CodingAgentHostBootstrap,
				options: { readonly rpcRuntimeDecision?: RpcRuntimeDecision },
			) => Promise<void>
		>(),
}));

vi.mock("@vetta/coding-agent/legacy/cli", () => ({
	main: legacyMain,
	runLegacyAgentWithBootstrap: legacyWithBootstrap,
}));

beforeEach(() => {
	legacyMain.mockReset().mockResolvedValue(undefined);
	legacyWithBootstrap.mockReset().mockResolvedValue(undefined);
});

describe("Legacy runtime execution gateway", () => {
	it("keeps explicit selection as a distinct execution cause", async () => {
		await runLegacyRuntimeExecution({ cause: "explicit-selection", args: ["--print", "hello"] });

		expect(legacyMain).toHaveBeenCalledExactlyOnceWith(["--print", "hello"]);
		expect(legacyWithBootstrap).not.toHaveBeenCalled();
	});

	it("runs an unrepresentable Session fallback only through the matching cause", async () => {
		const bootstrap = {} as CodingAgentHostBootstrap;
		const runtimeDecision: RpcRuntimeDecision = {
			requestedBackend: "greenfield",
			effectiveBackend: "legacy",
			fallbackReason: "legacy-session",
			sessionMigration: { status: "not-representable" },
		};
		const evidence = {
			reason: "legacy-session",
			sessionMigration: { status: "not-representable" },
		} as const;

		await runLegacyRuntimeExecution({
			cause: "session-migration-gap",
			bootstrap,
			evidence,
			runtimeDecision,
		});

		expect(legacyWithBootstrap).toHaveBeenCalledExactlyOnceWith(bootstrap, { rpcRuntimeDecision: runtimeDecision });
	});
});
