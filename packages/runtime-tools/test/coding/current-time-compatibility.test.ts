import { afterEach, describe, expect, it, vi } from "vitest";
import { ALL_SCENARIOS, resolveActiveToolNames } from "../../../coding-agent/src/core/session/tool-scope.js";
import { createCurrentTimeTool as createLegacyCurrentTimeTool } from "../../../coding-agent/src/core/tools/current-time/index.js";
import {
	type CurrentTimeToolInput,
	createCurrentTimeToolRegistration,
	selectCodingToolsForScope,
} from "../../src/coding/index.js";
import {
	defineToolCompatibilityContract,
	type ToolCompatibilitySubject,
} from "./compatibility/tool-compatibility-contract.js";

afterEach(() => {
	vi.useRealTimers();
});

function createLegacySubject(): ToolCompatibilitySubject<CurrentTimeToolInput> {
	const tool = createLegacyCurrentTimeTool();
	return {
		definition: {
			name: tool.name,
			label: tool.label,
			description: tool.description,
			schema: tool.parameters,
			scopeUse: tool.scope_use ?? [],
			category: tool.category ?? "",
		},
		execute(request) {
			return tool.execute("legacy-call", request.input, request.signal, (update) => request.onUpdate(update), {
				phase: request.reportPhase,
			});
		},
	};
}

function createRuntimeSubject(): ToolCompatibilitySubject<CurrentTimeToolInput> {
	const registration = createCurrentTimeToolRegistration();
	return {
		definition: {
			name: registration.tool.name,
			label: registration.tool.label,
			description: registration.tool.description,
			schema: registration.tool.inputSchema,
			scopeUse: registration.scopeUse,
			category: registration.category,
		},
		execute(request) {
			return registration.tool.execute({
				sessionId: "session-1",
				turnId: "turn-1",
				toolCallId: "runtime-call",
				input: request.input,
				signal: request.signal,
				onUpdate: request.onUpdate,
				reportPhase: request.reportPhase,
			});
		},
	};
}

defineToolCompatibilityContract<CurrentTimeToolInput>({
	toolName: "current_time",
	createLegacy: createLegacySubject,
	createRuntime: createRuntimeSubject,
	executionCases: [
		{
			name: "successful",
			input: {
				description: "Check the time",
			},
			setup() {
				vi.useFakeTimers();
				vi.setSystemTime(new Date(2026, 6, 26, 14, 30, 45));
			},
		},
		{
			name: "already-aborted direct",
			input: {},
			alreadyAborted: true,
			setup() {
				vi.useFakeTimers();
				vi.setSystemTime(new Date(2026, 6, 26, 14, 30, 45));
			},
		},
	],
});

describe("current_time scope compatibility", () => {
	it("selects the same active tool set for every legacy conversation scenario", () => {
		const legacyTool = createLegacyCurrentTimeTool();
		const runtimeRegistration = createCurrentTimeToolRegistration();

		for (const scenario of ALL_SCENARIOS) {
			const legacyNames = resolveActiveToolNames(scenario, [legacyTool], new Set());
			const runtimeNames = selectCodingToolsForScope([runtimeRegistration], scenario).map(({ name }) => name);
			expect(runtimeNames).toEqual(legacyNames);
		}
	});
});
