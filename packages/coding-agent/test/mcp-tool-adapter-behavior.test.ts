import { Value } from "@sinclair/typebox/value";
import { describe, expect, it, vi } from "vitest";
import {
	adaptMcpTool,
	type IMcpClient,
	type McpJsonObject,
	type McpTool,
	type McpToolCallResult,
} from "../src/core/mcp/index.js";

describe("MCP tool adapter behavior", () => {
	it("preserves the existing JSON Schema to TypeBox behavior", () => {
		const tool = adaptMcpTool(complexTool(), clientReturning({ content: [] }), "search");

		expect(
			Value.Check(tool.parameters, {
				requiredText: "alpha",
				optionalInt: 2,
				items: ["value", null],
				choice: true,
				unsupported: { arbitrary: true },
			}),
		).toBe(true);
		// The legacy converter mutates properties after Type.Object has already
		// materialized `required`, so nominally optional properties remain required.
		expect(Value.Check(tool.parameters, { requiredText: "beta", optionalInt: 2 })).toBe(false);
		expect(Value.Check(tool.parameters, { requiredText: "other" })).toBe(false);
		expect(Value.Check(tool.parameters, {})).toBe(false);
		expect(Value.Check(tool.parameters, { requiredText: "alpha", optionalInt: 2.5 })).toBe(false);
		expect(JSON.parse(JSON.stringify(tool.parameters))).toMatchObject({
			type: "object",
			required: ["requiredText", "optionalInt", "items", "choice", "unsupported"],
			properties: {
				requiredText: { anyOf: [{ const: "alpha" }, { const: "beta" }] },
				optionalInt: { type: "integer" },
				items: { type: "array", items: { anyOf: [{ type: "string" }, { type: "null" }] } },
				choice: { anyOf: [{ type: "number" }, { type: "boolean" }] },
				unsupported: {},
			},
		});
	});

	it("preserves names, ecosystem metadata and MCP content projection", async () => {
		const callTool = vi.fn(
			async (_name: string, _input?: McpJsonObject): Promise<McpToolCallResult> => ({
				content: [
					{ type: "text", text: "plain" },
					{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
					{ type: "resource", resource: { uri: "file:///text", text: "body", mimeType: "text/plain" } },
					{
						type: "resource",
						resource: { uri: "file:///binary", blob: "YmluYXJ5", mimeType: "application/octet-stream" },
					},
				],
			}),
		);
		const tool = adaptMcpTool(complexTool(), clientWithCall(callTool), "search");

		const result = await tool.execute("call-1", { requiredText: "alpha" }, new AbortController().signal);

		expect(tool).toMatchObject({
			name: "mcp_search_lookup",
			label: "search: lookup",
			description: "Lookup a value",
			ecosystemHook: {
				hostName: "mcp_search_lookup",
				kind: "mcp",
				source: { ecosystem: "mcp", serverName: "search", originalName: "lookup" },
			},
		});
		expect(callTool).toHaveBeenCalledWith("lookup", { requiredText: "alpha" });
		expect(result).toEqual({
			content: [
				{ type: "text", text: "plain" },
				{ type: "image", data: "aW1hZ2U=", mimeType: "image/png" },
				{ type: "text", text: "Resource: file:///text\nbody" },
				{ type: "text", text: "Resource: file:///binary\n[Binary data: application/octet-stream]" },
			],
			details: {
				content: expect.any(Array),
			},
		});
	});

	it("converts MCP call failures into the existing successful error result", async () => {
		const tool = adaptMcpTool(
			complexTool(),
			clientWithCall(async () => {
				throw new Error("remote failed");
			}),
			"search",
		);

		await expect(tool.execute("call-2", { requiredText: "alpha" }, new AbortController().signal)).resolves.toEqual({
			content: [{ type: "text", text: "Error calling MCP tool 'lookup': remote failed" }],
			details: {
				content: [{ type: "text", text: "remote failed" }],
				isError: true,
			},
		});
	});
});

function complexTool(): McpTool {
	return {
		name: "lookup",
		description: "Lookup a value",
		inputSchema: {
			type: "object",
			properties: {
				requiredText: { type: "string", enum: ["alpha", "beta"] },
				optionalInt: { type: "integer" },
				items: { type: "array", items: { anyOf: [{ type: "string" }, { type: "null" }] } },
				choice: { oneOf: [{ type: "number" }, { type: "boolean" }] },
				unsupported: { type: "custom" },
			},
			required: ["requiredText"],
		},
	};
}

function clientReturning(result: McpToolCallResult): IMcpClient {
	return clientWithCall(async () => result);
}

function clientWithCall(callTool: IMcpClient["callTool"]): IMcpClient {
	return {
		async initialize() {
			throw new Error("Not used");
		},
		async listTools() {
			throw new Error("Not used");
		},
		callTool,
		async listResources() {
			throw new Error("Not used");
		},
		async readResource() {
			throw new Error("Not used");
		},
		async listPrompts() {
			throw new Error("Not used");
		},
		async close() {},
	};
}
