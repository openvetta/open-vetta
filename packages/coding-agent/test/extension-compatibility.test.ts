import { describe, expect, it } from "vitest";
import {
	assessCodingAgentExtensionCompatibility,
	resolveCodingAgentGreenfieldExtensionCompatibility,
} from "../src/host/coding-agent-extension-compatibility.js";

describe("Coding Agent Extension compatibility assessment", () => {
	it("reports no runtime requirement when no Extension is loaded", () => {
		expect(
			assessCodingAgentExtensionCompatibility({
				extensions: [],
				pendingProviderNames: [],
			}),
		).toEqual({
			extensionCount: 0,
			bootstrapContributions: {
				providers: [],
				flags: [],
			},
			registrations: [],
			requiredRuntimeCapabilities: [],
			unmetRuntimeCapabilities: [],
			requiresLegacyRuntime: false,
		});
	});

	it("separates bootstrap contributions from registered runtime capabilities", () => {
		const assessment = assessCodingAgentExtensionCompatibility({
			extensions: [
				{
					path: "z-extension.ts",
					handlers: new Map([
						["turn_end", [async () => undefined]],
						["agent_start", [async () => undefined]],
						["unused", []],
					]),
					tools: new Map([["write_report", {}]]),
					commands: new Map([["report", {}]]),
					shortcuts: new Map([["ctrl+r", {}]]),
					flags: new Map([
						["verbose-report", {}],
						["report-format", {}],
					]),
					messageRenderers: new Map([["report-card", {}]]),
				},
				{
					path: "a-extension.ts",
					handlers: new Map(),
					tools: new Map(),
					commands: new Map(),
					shortcuts: new Map(),
					flags: new Map([["report-format", {}]]),
					messageRenderers: new Map(),
				},
			],
			pendingProviderNames: ["z-provider", "a-provider", "z-provider"],
		});

		expect(assessment).toEqual({
			extensionCount: 2,
			bootstrapContributions: {
				providers: ["a-provider", "z-provider"],
				flags: ["report-format", "verbose-report"],
			},
			registrations: [
				{
					path: "a-extension.ts",
					events: [],
					tools: [],
					commands: [],
					shortcuts: [],
					flags: ["report-format"],
					messageRenderers: [],
				},
				{
					path: "z-extension.ts",
					events: ["agent_start", "turn_end"],
					tools: ["write_report"],
					commands: ["report"],
					shortcuts: ["ctrl+r"],
					flags: ["report-format", "verbose-report"],
					messageRenderers: ["report-card"],
				},
			],
			requiredRuntimeCapabilities: [
				"opaque-runtime-api",
				"event-handler",
				"tool",
				"command",
				"shortcut",
				"message-renderer",
			],
			unmetRuntimeCapabilities: [
				"opaque-runtime-api",
				"event-handler",
				"tool",
				"command",
				"shortcut",
				"message-renderer",
			],
			requiresLegacyRuntime: true,
		});
	});

	it("allows bootstrap-only registrations after the Greenfield Action Host closes the opaque API gap", () => {
		const assessment = assessCodingAgentExtensionCompatibility({
			extensions: [
				{
					path: "bootstrap-extension.ts",
					handlers: new Map(),
					tools: new Map(),
					commands: new Map(),
					shortcuts: new Map(),
					flags: new Map([["custom-endpoint", {}]]),
					messageRenderers: new Map(),
				},
			],
			pendingProviderNames: ["custom-provider"],
		});

		expect(assessment.bootstrapContributions).toEqual({
			providers: ["custom-provider"],
			flags: ["custom-endpoint"],
		});
		expect(assessment.requiredRuntimeCapabilities).toEqual(["opaque-runtime-api"]);
		expect(assessment.requiresLegacyRuntime).toBe(true);
		expect(resolveCodingAgentGreenfieldExtensionCompatibility(assessment)).toMatchObject({
			requiredRuntimeCapabilities: ["opaque-runtime-api"],
			unmetRuntimeCapabilities: [],
			requiresLegacyRuntime: false,
		});
	});

	it("keeps independently unsupported registrations on Legacy", () => {
		const assessment = assessCodingAgentExtensionCompatibility({
			extensions: [
				{
					path: "event-extension.ts",
					handlers: new Map([["turn_end", [async () => undefined]]]),
					tools: new Map(),
					commands: new Map(),
					shortcuts: new Map(),
					flags: new Map(),
					messageRenderers: new Map(),
				},
			],
			pendingProviderNames: [],
		});

		expect(resolveCodingAgentGreenfieldExtensionCompatibility(assessment)).toMatchObject({
			unmetRuntimeCapabilities: ["event-handler"],
			requiresLegacyRuntime: true,
		});
	});
});
