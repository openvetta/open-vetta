import { describe, expect, it } from "vitest";
import {
	DESKTOP_AGENT_RUNTIME_ENV,
	resolveDesktopAgentRuntimeBackend,
	resolveDesktopAgentRuntimeDecision,
} from "./desktop-runtime-selector.js";

describe("resolveDesktopAgentRuntimeBackend", () => {
	it("uses Greenfield as the startup default", () => {
		expect(resolveDesktopAgentRuntimeBackend(undefined)).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeBackend("")).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeBackend("   ")).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeDecision(undefined)).toEqual({
			requestedBackend: "default",
			effectiveBackend: "greenfield",
			source: "default",
		});
	});

	it("maps an explicit Legacy request to Greenfield", () => {
		expect(resolveDesktopAgentRuntimeBackend("legacy")).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeDecision("legacy")).toEqual({
			requestedBackend: "legacy",
			effectiveBackend: "greenfield",
			source: "environment",
		});
	});

	it("accepts an explicit Greenfield selection", () => {
		expect(resolveDesktopAgentRuntimeBackend("greenfield")).toBe("greenfield");
		expect(resolveDesktopAgentRuntimeDecision("greenfield")).toEqual({
			requestedBackend: "greenfield",
			effectiveBackend: "greenfield",
			source: "environment",
		});
	});

	it("rejects unknown runtime names instead of silently falling back", () => {
		expect(() => resolveDesktopAgentRuntimeBackend("auto")).toThrow(DESKTOP_AGENT_RUNTIME_ENV);
	});
});
