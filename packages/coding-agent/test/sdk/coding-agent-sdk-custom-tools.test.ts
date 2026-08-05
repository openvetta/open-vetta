import { Type } from "@sinclair/typebox";
import type { AgentToolUpdateCallback } from "@vetta/agent-core";
import { describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "../../src/extensions/index.js";
import { adaptPublicCodingAgentSdkCustomTools } from "../../src/host/coding-agent-sdk-host-adapter.js";
import type { Theme } from "../../src/modes/interactive/theme/theme.js";
import type { CodingAgentSessionToolDefinition, CodingAgentToolExecutionContext } from "../../src/public-api/sdk.js";

describe("Coding Agent SDK custom tool adapter", () => {
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
