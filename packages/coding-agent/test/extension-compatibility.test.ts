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
			unsupportedEvents: [],
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
			unsupportedEvents: ["agent_start", "turn_end"],
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
			unsupportedEvents: [],
			requiresLegacyRuntime: false,
		});
	});

	it("allows the lossless input, lifecycle and tool events implemented by the Greenfield event host", () => {
		const assessment = assessCodingAgentExtensionCompatibility({
			extensions: [
				{
					path: "supported-events.ts",
					handlers: new Map([
						["input", [async () => undefined]],
						["session_start", [async () => undefined]],
						["session_shutdown", [async () => undefined]],
						["agent_start", [async () => undefined]],
						["turn_start", [async () => undefined]],
						["turn_end", [async () => undefined]],
						["tool_call", [async () => undefined]],
						["tool_result", [async () => undefined]],
						["tool_execution_start", [async () => undefined]],
						["tool_execution_update", [async () => undefined]],
						["tool_execution_phase", [async () => undefined]],
						["tool_execution_end", [async () => undefined]],
					]),
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
			unmetRuntimeCapabilities: [],
			unsupportedEvents: [],
			requiresLegacyRuntime: false,
		});
	});

	it("keeps message-identity and input-mutating events on Legacy", () => {
		const assessment = assessCodingAgentExtensionCompatibility({
			extensions: [
				{
					path: "event-extension.ts",
					handlers: new Map([
						["input", [async () => undefined]],
						["context", [async () => undefined]],
						["agent_end", [async () => undefined]],
						["message_end", [async () => undefined]],
						["before_agent_start", [async () => undefined]],
					]),
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
			unsupportedEvents: ["agent_end", "before_agent_start", "context", "message_end"],
			requiresLegacyRuntime: true,
		});
	});
});
