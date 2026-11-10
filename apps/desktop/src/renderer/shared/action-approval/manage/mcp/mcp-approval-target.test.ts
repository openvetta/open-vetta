import { describe, expect, it } from "vitest";
import { describeMcpLocation, mcpTargetPayload, readMcpApprovalTarget } from "./mcp-approval-target";

describe("MCP approval target", () => {
	it("reads the scope and project root from the agent's request, ignoring unrelated fields", () => {
		expect(
			readMcpApprovalTarget({
				operation: "upsert",
				name: "docs",
				scope: "project",
				cwd: "/work/repo",
				data: { cwd: "/srv" },
			}),
		).toEqual({ scope: "project", cwd: "/work/repo" });
		expect(readMcpApprovalTarget({ operation: "remove", name: "docs" })).toEqual({});
		expect(readMcpApprovalTarget({ scope: "workspace", cwd: "" })).toEqual({});
	});

	it("carries the target back into the request rebuilt after the user edits it", () => {
		const target = readMcpApprovalTarget({ scope: "project", cwd: "/work/repo" });

		expect({ operation: "upsert", name: "docs", data: { command: "node" }, ...mcpTargetPayload(target) }).toEqual({
			operation: "upsert",
			name: "docs",
			data: { command: "node" },
			scope: "project",
			cwd: "/work/repo",
		});
		expect(mcpTargetPayload({})).toEqual({});
	});

	it("labels a write as project-level only when the agent explicitly chose the project scope", () => {
		expect(describeMcpLocation({ scope: "project", cwd: "/work/repo" })).toEqual({
			kind: "project",
			path: "/work/repo",
		});
		expect(describeMcpLocation({ cwd: "/work/repo" })).toEqual({ kind: "global" });
		expect(describeMcpLocation({ scope: "project" })).toEqual({ kind: "global" });
		expect(describeMcpLocation({})).toEqual({ kind: "global" });
	});
});
