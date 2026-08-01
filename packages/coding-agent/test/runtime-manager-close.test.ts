import { describe, expect, it, vi } from "vitest";
import type { AgentSession } from "../src/core/agent-session.js";
import type { BackgroundTaskManager } from "../src/core/background-tasks/index.js";
import type { McpManager } from "../src/core/mcp/index.js";
import type { ResourceLoader } from "../src/core/resource-loader.js";
import { RuntimeManager } from "../src/core/session/runtime-manager.js";
import type { SessionContext } from "../src/core/session/session-context.js";
import type { TodoStore } from "../src/core/todo-store.js";

const createMcpManagerMock = vi.hoisted(() => vi.fn());

vi.mock("../src/core/mcp/index.js", () => ({
	createMcpManager: createMcpManagerMock,
}));

describe("RuntimeManager close", () => {
	it("waits for MCP initialization and prevents a late runtime rebuild", async () => {
		let finishInitialization = () => {};
		const initialization = new Promise<void>((resolve) => {
			finishInitialization = resolve;
		});
		const shutdown = vi.fn(async () => {});
		createMcpManagerMock.mockReturnValue({
			initialize: vi.fn(() => initialization),
			shutdown,
		} as unknown as McpManager);

		const manager = new RuntimeManager({ cwd: "C:/workspace" } as SessionContext, {} as AgentSession, {
			resourceLoader: {} as ResourceLoader,
			todoStore: {} as TodoStore,
			customTools: [],
			enableMcp: true,
			mcpDebug: false,
			backgroundTasks: {} as BackgroundTaskManager,
			enableBackgroundTasks: false,
		});
		const buildRuntime = vi.spyOn(manager, "buildRuntime").mockImplementation(() => {});

		manager.initMcp();
		const first = manager.close();
		expect(manager.close()).toBe(first);
		expect(shutdown).not.toHaveBeenCalled();

		finishInitialization();
		await first;
		expect(buildRuntime).not.toHaveBeenCalled();
		expect(shutdown).toHaveBeenCalledOnce();
	});
});
