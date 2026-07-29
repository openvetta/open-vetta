import { describe, expect, it } from "vitest";
import { DESKTOP_AGENT_RUNTIME_ENV, resolveDesktopAgentRuntimeBackend } from "./desktop-runtime-selector.js";

describe("resolveDesktopAgentRuntimeBackend", () => {
	it("keeps Legacy as the startup default", () => {
		expect(resolveDesktopAgentRuntimeBackend(undefined)).toBe("legacy");
		expect(resolveDesktopAgentRuntimeBackend("")).toBe("legacy");
		expect(resolveDesktopAgentRuntimeBackend("legacy")).toBe("legacy");
	});

	it("requires an explicit Greenfield opt-in", () => {
		expect(resolveDesktopAgentRuntimeBackend("greenfield")).toBe("greenfield");
	});

	it("rejects unknown runtime names instead of silently falling back", () => {
		expect(() => resolveDesktopAgentRuntimeBackend("auto")).toThrow(DESKTOP_AGENT_RUNTIME_ENV);
	});
});
