import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

const runtimeSelector = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("electron", () => ({
	app: {
		isPackaged: true,
		getAppPath: () => "C:\\app",
	},
}));

vi.mock("@vetta/cli-app", () => ({
	runAgentRuntimeCli: runtimeSelector,
}));

import { runAgentRpcCommand } from "../cli/agent-rpc-command.js";
import { buildCodingAgentSpec, resolveImAgentRuntimeBackend } from "./coding-agent-spec.js";

const originalResourcesPath = Object.getOwnPropertyDescriptor(process, "resourcesPath");
const originalPackageDir = process.env.VETTA_PACKAGE_DIR;

afterEach(() => {
	vi.restoreAllMocks();
	runtimeSelector.mockClear();
	if (originalResourcesPath) {
		Object.defineProperty(process, "resourcesPath", originalResourcesPath);
	} else {
		Reflect.deleteProperty(process, "resourcesPath");
	}
	if (originalPackageDir === undefined) {
		delete process.env.VETTA_PACKAGE_DIR;
	} else {
		process.env.VETTA_PACKAGE_DIR = originalPackageDir;
	}
});

describe("IM coding-agent runtime selection", () => {
	test("defaults to Legacy and accepts only the explicit Greenfield opt-in", () => {
		expect(resolveImAgentRuntimeBackend(undefined)).toBe("legacy");
		expect(resolveImAgentRuntimeBackend("")).toBe("legacy");
		expect(resolveImAgentRuntimeBackend("legacy")).toBe("legacy");
		expect(resolveImAgentRuntimeBackend("greenfield-im")).toBe("greenfield-im");
		expect(() => resolveImAgentRuntimeBackend("greenfield")).toThrow("VETTA_IM_AGENT_RUNTIME");
	});

	test("keeps runtime selection typed and separate from the Windows executable prefix", () => {
		vi.spyOn(process, "platform", "get").mockReturnValue("win32");
		Object.defineProperty(process, "resourcesPath", {
			configurable: true,
			value: "C:\\resources",
		});

		const spec = buildCodingAgentSpec({ runtimeBackend: "greenfield-im" });

		expect(spec).toMatchObject({
			bin: process.execPath,
			prefixArgs: ["C:\\resources\\coding-agent\\dist\\agent-rpc-cli.mjs", "--scenario", "im-claw"],
			runtimeBackend: "greenfield-im",
			runAsNode: true,
			packageDir: "C:\\resources\\coding-agent",
		});
		expect(spec.prefixArgs).not.toContain("--agent-runtime");
	});

	test("routes the Electron discriminator through the shared CLI Runtime Selector", async () => {
		Object.defineProperty(process, "resourcesPath", {
			configurable: true,
			value: "C:\\resources",
		});

		await expect(runAgentRpcCommand(["--agent-runtime", "greenfield-im", "--mode", "rpc"])).resolves.toBe(0);
		expect(runtimeSelector).toHaveBeenCalledWith(["--agent-runtime", "greenfield-im", "--mode", "rpc"]);
	});

	test("packages the Windows RPC entry from cli-app instead of the Legacy coding-agent CLI", () => {
		const preparePackPath = fileURLToPath(new URL("../../../scripts/prepare-pack.js", import.meta.url));
		const source = readFileSync(preparePackPath, "utf8");

		expect(source).toContain('join(cliAppDir, "src", "agent-rpc-cli.ts")');
		expect(source).not.toContain('join(codingAgentDir, "dist", "cli.js")');
	});
});
