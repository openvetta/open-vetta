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

	it("runs an Extension compatibility fallback only with the matching cause", async () => {
		const bootstrap = {} as CodingAgentHostBootstrap;
		const runtimeDecision: RpcRuntimeDecision = {
			requestedBackend: "greenfield",
			effectiveBackend: "legacy",
		};
		const evidence = {
			reason: "legacy-extension",
			extensionCompatibility: {
				requiresLegacyRuntime: true,
				unsupportedEvents: ["future_event"],
				unmetRuntimeCapabilities: ["event-handler"],
			},
		} as const;

		await runLegacyRuntimeExecution({
			cause: "extension-compatibility-gap",
			bootstrap,
			evidence,
			runtimeDecision,
		});

		expect(legacyWithBootstrap).toHaveBeenCalledExactlyOnceWith(bootstrap, { rpcRuntimeDecision: runtimeDecision });
	});

	it("rejects a cause that disagrees with the structured fallback evidence", async () => {
		await expect(
			runLegacyRuntimeExecution({
				cause: "session-migration-gap",
				bootstrap: {} as CodingAgentHostBootstrap,
				evidence: {
					reason: "legacy-extension",
					extensionCompatibility: {
						requiresLegacyRuntime: true,
						unsupportedEvents: ["future_event"],
						unmetRuntimeCapabilities: ["event-handler"],
					},
				},
				runtimeDecision: { requestedBackend: "greenfield", effectiveBackend: "legacy" },
			}),
		).rejects.toThrow("does not match fallback reason legacy-extension");
		expect(legacyWithBootstrap).not.toHaveBeenCalled();
	});
});
