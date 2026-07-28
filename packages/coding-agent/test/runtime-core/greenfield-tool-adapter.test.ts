import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolResult } from "@vetta/runtime-core/kernel";
import { describe, expect, it, vi } from "vitest";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "../../src/adapters/runtime-core/index.js";
import type { CodingAgentTool } from "../../src/core/session/tool-scope.js";
import { createKbListTagsTool } from "../../src/core/tools/kb-list-tags/index.js";

const inputSchema = Type.Object({
	value: Type.String(),
});

describe("Greenfield AgentTool adapter", () => {
	it("preserves execution updates, phases and availability metadata", async () => {
		type Input = Static<typeof inputSchema>;
		interface Details {
			readonly value: string;
		}
		const execute = vi.fn(
			async (
				_toolCallId: string,
				input: Input,
				_signal: AbortSignal | undefined,
				onUpdate: ((result: { content: []; details: Details }) => void) | undefined,
				context: { phase(label: string): void } | undefined,
			) => {
				context?.phase("working");
				onUpdate?.({ content: [], details: { value: "partial" } });
				return {
					content: [{ type: "text" as const, text: input.value }],
					details: { value: input.value },
				};
			},
		);
		const legacyTool: CodingAgentTool<typeof inputSchema, Details> = {
			name: "test_tool",
			label: "Test Tool",
			description: "Test adapter",
			parameters: inputSchema,
			scope_use: ["project"],
			requires: ["knowledge"],
			category: "kb-read",
			execute,
		};
		const registration = adaptCodingAgentToolRegistration(legacyTool);
		const updates: RuntimeToolResult[] = [];
		const phases: string[] = [];
		const signal = new AbortController().signal;

		const result = await registration.tool.execute({
			sessionId: "session-1",
			turnId: "turn-1",
			toolCallId: "call-1",
			input: { value: "done" },
			signal,
			onUpdate: (update) => updates.push(update),
			reportPhase: (phase) => phases.push(phase),
		});

		expect(result).toEqual({
			content: [{ type: "text", text: "done" }],
			details: { value: "done" },
		});
		expect(updates).toEqual([{ content: [], details: { value: "partial" } }]);
		expect(phases).toEqual(["working"]);
		expect(execute).toHaveBeenCalledWith(
			"call-1",
			{ value: "done" },
			signal,
			expect.any(Function),
			expect.objectContaining({ phase: expect.any(Function) }),
		);
		expect(registration).toMatchObject({
			scopeUse: ["project"],
			requires: ["knowledge"],
			category: "kb-read",
		});
	});

	it("keeps the legacy knowledge tool capability contract", () => {
		const registration: CodingAgentRuntimeToolRegistration = adaptCodingAgentToolRegistration(createKbListTagsTool());

		expect(registration.tool.name).toBe("kb_list_available_tags");
		expect(registration.scopeUse).toContain("cli");
		expect(registration.requires).toEqual(["knowledge"]);
		expect(registration.category).toBe("kb-read");
	});
});
