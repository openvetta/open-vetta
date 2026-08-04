import { Type } from "@sinclair/typebox";
import type { AgentToolUpdateCallback } from "@vetta/agent-core";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext, ToolDefinition } from "../../src/extensions/index.js";
import {
	adaptCodingAgentSdkCustomTools,
	adaptPublicCodingAgentSdkCustomTools,
	CODING_AGENT_SDK_CUSTOM_TOOL_ERROR_CODES,
} from "../../src/host/coding-agent-sdk-host-adapter.js";
import type { Theme } from "../../src/modes/interactive/theme/theme.js";
import type { CodingAgentSessionToolDefinition, CodingAgentToolExecutionContext } from "../../src/public-api/sdk.js";

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

	it("adapts the stable public tool contract without exposing product managers", async () => {
		const parameters = Type.Object({ value: Type.String() });
		const component = { render: () => ["rendered"] };
		const renderCall = vi.fn(() => component);
		const execute = vi.fn(
			async (
				_toolCallId: string,
				params: { value: string },
				_signal: AbortSignal | undefined,
				_onUpdate: AgentToolUpdateCallback<unknown> | undefined,
				context: CodingAgentToolExecutionContext,
			) => ({
				content: [{ type: "text" as const, text: `${context.cwd}:${params.value}` }],
				details: undefined,
			}),
		);
		const tool: CodingAgentSessionToolDefinition<typeof parameters> = {
			name: "public_echo",
			label: "Public Echo",
			description: "Echo through the stable SDK contract",
			parameters,
			execute,
			renderCall,
		};
		const adapted = adaptPublicCodingAgentSdkCustomTools([tool]);
		const definition = adapted?.[0]?.definition;
		if (!definition) throw new Error("Missing adapted public SDK custom tool");
		const context = { cwd: "C:/public-workspace" } as unknown as ExtensionContext;

		await expect(
			definition.execute("call-public", { value: "ok" }, undefined, undefined, context),
		).resolves.toMatchObject({ content: [{ type: "text", text: "C:/public-workspace:ok" }] });
		expect(execute).toHaveBeenCalledWith("call-public", { value: "ok" }, undefined, undefined, context);
		const currentTheme = {} as Theme;
		expect(definition.renderCall?.({ value: "ok" }, currentTheme)).toBe(component);
		expect(renderCall).toHaveBeenCalledWith({ value: "ok" }, currentTheme);
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
