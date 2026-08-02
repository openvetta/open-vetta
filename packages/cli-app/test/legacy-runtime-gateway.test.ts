import { beforeEach, describe, expect, it, vi } from "vitest";
import { runLegacyRuntimeExecution } from "../src/legacy-runtime-gateway.js";

const { legacyMain } = vi.hoisted(() => ({
	legacyMain: vi.fn<(args: string[]) => Promise<void>>(),
}));

vi.mock("@vetta/coding-agent/legacy/cli", () => ({
	main: legacyMain,
}));

beforeEach(() => {
	legacyMain.mockReset().mockResolvedValue(undefined);
});

describe("Legacy runtime execution gateway", () => {
	it("keeps explicit selection as a distinct execution cause", async () => {
		await runLegacyRuntimeExecution({ cause: "explicit-selection", args: ["--print", "hello"] });

		expect(legacyMain).toHaveBeenCalledExactlyOnceWith(["--print", "hello"]);
	});
});
