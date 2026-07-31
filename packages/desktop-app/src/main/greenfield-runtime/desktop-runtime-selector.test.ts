import { describe, expect, it } from "vitest";
import { DESKTOP_AGENT_RUNTIME_ENV, resolveDesktopAgentRuntimeBackend } from "./desktop-runtime-selector.js";

describe("resolveDesktopAgentRuntimeBackend", () => {
	it("uses Greenfield as the startup default", () => {
		expect(resolveDesktopAgentRuntimeBackend(undefined)).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeBackend("")).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeBackend("   ")).toBe("greenfield");
	});

	it("keeps an explicit Legacy rollback", () => {
		expect(resolveDesktopAgentRuntimeBackend("legacy")).toBe("legacy");
	});

	it("accepts an explicit Greenfield selection", () => {
		expect(resolveDesktopAgentRuntimeBackend("greenfield")).toBe("greenfield");
	});

	it("rejects unknown runtime names instead of silently falling back", () => {
		expect(() => resolveDesktopAgentRuntimeBackend("auto")).toThrow(DESKTOP_AGENT_RUNTIME_ENV);
	});
});
