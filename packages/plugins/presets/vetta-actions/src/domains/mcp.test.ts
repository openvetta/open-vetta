import { describe, expect, it, vi } from "vitest";
import { registerMcpActions } from "./mcp";

type Registered = {
	id: string;
	handler: (args: { input: unknown; signal: AbortSignal }) => Promise<unknown>;
	assertReady?: (args: { input: unknown; signal: AbortSignal }) => Promise<void>;
	inputSchema: { oneOf: { properties: Record<string, unknown> }[] };
};

function createMockCtx() {
	const registered: Registered[] = [];
	const official = {
		mcp: {
			list: vi.fn().mockResolvedValue([]),
			get: vi.fn().mockResolvedValue({ name: "docs" }),
			listNames: vi.fn().mockResolvedValue(["docs"]),
			upsert: vi.fn().mockResolvedValue({ name: "docs", scope: "project" }),
			setEnabled: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		},
	};
	const ctx = {
		official,
		appActions: {
			register: (definition: Registered) => {
				registered.push(definition);
			},
		},
	};
	registerMcpActions(ctx as never);
	const action = (id: string) => {
		const found = registered.find((item) => item.id === id);
		if (!found) throw new Error(`action not registered: ${id}`);
		return found;
	};
	return { official, query: action("mcp.query"), manage: action("mcp.manage") };
}

const signal = new AbortController().signal;

describe("registerMcpActions scope", () => {
	it("exposes scope and cwd on every operation that can target a layer", () => {
		const { query, manage } = createMockCtx();
		const withTarget = (action: Registered) =>
			action.inputSchema.oneOf.filter((branch) => "scope" in branch.properties && "cwd" in branch.properties).length;

		// query: list + get（help 没有落点）；manage: upsert + set-enabled + remove
		expect(withTarget(query)).toBe(2);
		expect(withTarget(manage)).toBe(3);
	});

	it("installs into the project layer when the agent asks for it", async () => {
		const { manage, official } = createMockCtx();
		const data = { command: "npx", args: ["-y", "docs-mcp"] };

		await manage.handler({
			input: { operation: "upsert", name: "docs", data, scope: "project", cwd: "/work/repo" },
			signal,
		});

		expect(official.mcp.upsert).toHaveBeenCalledWith("docs", data, { scope: "project", cwd: "/work/repo" });
	});

	it("keeps the global default when no scope or cwd is passed", async () => {
		const { manage, query, official } = createMockCtx();

		await manage.handler({ input: { operation: "upsert", name: "docs", data: { command: "node" } }, signal });
		await manage.handler({ input: { operation: "remove", name: "docs" }, signal });
		await query.handler({ input: { operation: "list" }, signal });

		expect(official.mcp.upsert).toHaveBeenCalledWith("docs", { command: "node" }, {});
		expect(official.mcp.remove).toHaveBeenCalledWith("docs", {});
		expect(official.mcp.list).toHaveBeenCalledWith({});
	});

	it("lists a project's servers together with the global ones and checks existence in the same layer", async () => {
		const { manage, query, official } = createMockCtx();

		await query.handler({ input: { operation: "list", cwd: "/work/repo" }, signal });
		await manage.assertReady?.({
			input: { operation: "set-enabled", name: "docs", enabled: false, scope: "project", cwd: "/work/repo" },
			signal,
		});
		await manage.handler({
			input: { operation: "set-enabled", name: "docs", enabled: false, scope: "project", cwd: "/work/repo" },
			signal,
		});

		expect(official.mcp.list).toHaveBeenCalledWith({ cwd: "/work/repo" });
		expect(official.mcp.listNames).toHaveBeenCalledWith({ scope: "project", cwd: "/work/repo" });
		expect(official.mcp.setEnabled).toHaveBeenCalledWith("docs", false, { scope: "project", cwd: "/work/repo" });
	});

	it("tells the agent how scope works in the help guidance", async () => {
		const { query } = createMockCtx();

		const help = (await query.handler({ input: { operation: "help" }, signal })) as { guidance: string };

		expect(help.guidance).toContain("scope");
		expect(help.guidance).toContain(".mcp.json");
	});

	it("lets the agent install an sse server and tells it when sse is appropriate", async () => {
		const { manage, official } = createMockCtx();
		const upsertBranch = manage.inputSchema.oneOf.find(
			(branch) => (branch.properties.operation as { const?: string }).const === "upsert",
		);
		const dataBranches = (upsertBranch?.properties.data as { oneOf: { properties: { type?: unknown } }[] }).oneOf;
		const remoteType = dataBranches.map((branch) => branch.properties.type).find((type) => "enum" in (type as object));

		expect(remoteType).toEqual({ enum: ["http", "sse"] });
		await manage.handler({
			input: { operation: "upsert", name: "legacy", data: { type: "sse", url: "https://legacy.example.com/sse" } },
			signal,
		});
		expect(official.mcp.upsert).toHaveBeenCalledWith(
			"legacy",
			{ type: "sse", url: "https://legacy.example.com/sse" },
			{},
		);
	});
});
