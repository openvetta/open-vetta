import type {
	CodingAgentExtensionCompatibilityAssessment,
	CodingAgentHostBootstrap,
} from "@vetta/coding-agent/bootstrap";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentRuntimeCli } from "../src/agent-runtime-selection.js";

const runtimeMocks = vi.hoisted(() => ({
	createBootstrap: vi.fn<() => Promise<unknown>>(),
	prepareIm: vi.fn<() => Promise<unknown>>(),
	preparePrint: vi.fn<() => Promise<unknown>>(),
	prepareRpc: vi.fn<() => Promise<unknown>>(),
	runLegacy: vi.fn<() => Promise<void>>(),
	runGreenfieldIm: vi.fn<() => Promise<void>>(),
	runGreenfieldPrint: vi.fn<() => Promise<void>>(),
	runGreenfieldRpc: vi.fn<() => Promise<void>>(),
}));

vi.mock("@vetta/coding-agent/bootstrap", () => ({
	createAgentCliBootstrap: runtimeMocks.createBootstrap,
	resolveCodingAgentSessionDir: () => "C:/test/conversations",
}));

vi.mock("@vetta/coding-agent/cli-control", () => ({
	runCodingAgentCliControl: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("../src/legacy-runtime-gateway.js", () => ({
	runLegacyRuntimeExecution: runtimeMocks.runLegacy,
}));

vi.mock("../src/rpc/cli-session-format-compatibility.js", () => ({
	createCliRuntimeSessionCatalog: () => ({}),
}));

vi.mock("../src/rpc/greenfield-im-runtime-host.js", () => ({
	prepareGreenfieldImRuntimeHost: runtimeMocks.prepareIm,
	runGreenfieldImRuntimeHost: runtimeMocks.runGreenfieldIm,
}));

vi.mock("../src/rpc/greenfield-rpc-runtime-host.js", () => ({
	prepareGreenfieldPrintRuntimeHost: runtimeMocks.preparePrint,
	prepareGreenfieldRpcRuntimeHost: runtimeMocks.prepareRpc,
	runGreenfieldPrintRuntimeHost: runtimeMocks.runGreenfieldPrint,
	runGreenfieldRpcRuntimeHost: runtimeMocks.runGreenfieldRpc,
}));

const bootstrap = {
	cwd: "C:/test/workspace",
	parsed: { sessionDir: "C:/test/conversations" },
} as CodingAgentHostBootstrap;

const extensionCompatibility = {
	extensionCount: 1,
	bootstrapContributions: { providers: [], flags: [] },
	registrations: [
		{
			path: "C:/test/forward-extension.ts",
			events: ["future_event"],
			tools: [],
			commands: [],
			shortcuts: [],
			flags: [],
			messageRenderers: [],
		},
	],
	requiredRuntimeCapabilities: ["opaque-runtime-api", "event-handler"],
	inapplicableRuntimeCapabilities: [],
	requiresLegacyRuntime: true,
	inapplicableEvents: [],
	unsupportedEvents: ["future_event"],
	unmetRuntimeCapabilities: ["event-handler"],
} satisfies CodingAgentExtensionCompatibilityAssessment;

beforeEach(() => {
	process.exitCode = undefined;
	runtimeMocks.createBootstrap.mockReset().mockResolvedValue(bootstrap);
	for (const prepare of [runtimeMocks.prepareIm, runtimeMocks.preparePrint, runtimeMocks.prepareRpc]) {
		prepare.mockReset().mockResolvedValue({
			kind: "extension-incompatible",
			bootstrap,
			sessionPath: undefined,
			extensionCompatibility,
		});
	}
	for (const run of [
		runtimeMocks.runLegacy,
		runtimeMocks.runGreenfieldIm,
		runtimeMocks.runGreenfieldPrint,
		runtimeMocks.runGreenfieldRpc,
	]) {
		run.mockReset().mockResolvedValue(undefined);
	}
});

afterEach(() => {
	vi.restoreAllMocks();
	process.exitCode = undefined;
});

describe("Extension incompatibility policy", () => {
	it("writes one validated RPC startup failure without invoking Legacy", async () => {
		const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

		await runAgentRuntimeCli(["--agent-runtime", "greenfield-im", "--mode", "rpc"]);

		expect(process.exitCode).toBe(2);
		expect(stdout).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({
			type: "response",
			command: "startup",
			success: false,
			errorCode: "extension_incompatible",
			error: "Extension requires events or runtime capabilities that are not supported by the requested runtime",
			requestedBackend: "greenfield-im",
			unsupportedEvents: ["future_event"],
			unmetRuntimeCapabilities: ["event-handler"],
		});
		expect(stderr).not.toHaveBeenCalled();
		expect(runtimeMocks.runLegacy).not.toHaveBeenCalled();
		expect(runtimeMocks.runGreenfieldIm).not.toHaveBeenCalled();
	});

	it("writes Print diagnostics without invoking Legacy or a Greenfield session", async () => {
		const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
		const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

		await runAgentRuntimeCli(["--mode", "json", "reject incompatible extension"]);

		expect(process.exitCode).toBe(2);
		expect(stdout).not.toHaveBeenCalled();
		expect(stderr).toHaveBeenCalledOnce();
		expect(String(stderr.mock.calls[0]?.[0])).toContain(
			"errorCode=extension_incompatible requested=greenfield unsupportedEvents=future_event unmetCapabilities=event-handler",
		);
		expect(runtimeMocks.runLegacy).not.toHaveBeenCalled();
		expect(runtimeMocks.runGreenfieldPrint).not.toHaveBeenCalled();
	});
});
