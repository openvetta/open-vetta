import { Type } from "@sinclair/typebox";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ToolDefinition } from "../../src/core/extensions/types.js";
import {
	adaptCodingAgentSdkCustomTools,
	CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES,
} from "../../src/host/coding-agent-sdk-host-adapter.js";

describe("Coding Agent SDK custom tool adapter", () => {
	it("rejects a non-TypeBox schema before registering any Session tools", () => {
		const invalid = {
			...customTool(vi.fn()),
			parameters: { type: "object" },
		} as unknown as ToolDefinition;

		expect(() => adaptCodingAgentSdkCustomTools([invalid])).toThrowError(
			expect.objectContaining({
				code: CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES.INVALID_SCHEMA,
				toolName: "sdk_echo",
			}),
		);
	});

	it("validates invocation input and preserves the legacy execution context", async () => {
		const execute = vi.fn(async (_toolCallId, params) => ({
			content: [{ type: "text" as const, text: readValue(params) }],
			details: undefined,
		}));
		const adapted = adaptCodingAgentSdkCustomTools([customTool(execute)]);
		const definition = adapted?.[0]?.definition;
		if (!definition) throw new Error("Missing adapted SDK custom tool");
		const context = { cwd: "C:/workspace" } as unknown as ExtensionContext;
		const signal = new AbortController().signal;

		await expect(definition.execute("call-invalid", { value: 1 }, signal, undefined, context)).rejects.toMatchObject({
			code: CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES.INVALID_INPUT,
			toolName: "sdk_echo",
		});
		expect(execute).not.toHaveBeenCalled();

		await expect(
			definition.execute("call-valid", { value: "ok" }, signal, undefined, context),
		).resolves.toMatchObject({ content: [{ type: "text", text: "ok" }] });
		expect(execute).toHaveBeenCalledWith("call-valid", { value: "ok" }, signal, undefined, context);
	});
});

function customTool(execute: ToolDefinition["execute"]): ToolDefinition {
	return {
		name: "sdk_echo",
		label: "SDK Echo",
		description: "Echo validated input",
		parameters: Type.Object({ value: Type.String() }),
		execute,
	};
}

function readValue(value: unknown): string {
	if (typeof value !== "object" || value === null) throw new Error("Expected SDK tool input");
	const text = Reflect.get(value, "value");
	if (typeof text !== "string") throw new Error("Expected SDK tool value");
	return text;
}
