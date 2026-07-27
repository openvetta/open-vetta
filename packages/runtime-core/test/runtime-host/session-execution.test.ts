import { describe, expect, it, vi } from "vitest";
import {
	LegacyRuntimeSessionExecutionController,
	LegacyRuntimeSessionWorkspaceView,
	type RuntimeSession,
} from "../../src/index.js";

function createExecutionSessionDouble(options: { isStreaming?: boolean; isBashRunning?: boolean } = {}) {
	const reconfigureCustomTools = vi.fn();
	const session = {
		isStreaming: options.isStreaming ?? false,
		isBashRunning: options.isBashRunning ?? false,
		sessionManager: { getCwd: () => "C:/workspace" },
		reconfigureCustomTools,
	} as unknown as RuntimeSession;
	return { session, reconfigureCustomTools };
}

describe("legacy session execution and workspace ports", () => {
	it("reads the workspace without exposing SessionManager", () => {
		const { session } = createExecutionSessionDouble();
		const workspaceView = new LegacyRuntimeSessionWorkspaceView(session);

		expect(workspaceView.readWorkingDirectory()).toBe("C:/workspace");
	});

	it.each([
		{ isStreaming: false, isBashRunning: false, expected: false },
		{ isStreaming: true, isBashRunning: false, expected: true },
		{ isStreaming: false, isBashRunning: true, expected: true },
	])("maps streaming/bash activity to the busy precondition", (options) => {
		const { session } = createExecutionSessionDouble(options);
		const controller = new LegacyRuntimeSessionExecutionController(session);

		expect(controller.isBusy()).toBe(options.expected);
	});

	it("translates execution modes to legacy custom tool reconfiguration", () => {
		const { session, reconfigureCustomTools } = createExecutionSessionDouble();
		const controller = new LegacyRuntimeSessionExecutionController(session);

		controller.reconfigure({ mode: "full-access", sessionId: "session-1" });
		controller.reconfigure({
			mode: "sandbox",
			sessionId: "session-1",
			sandboxHostPath: process.execPath,
			linuxBubblewrapPath: process.execPath,
			macosSandboxExecPath: process.execPath,
		});

		expect(reconfigureCustomTools).toHaveBeenNthCalledWith(1, undefined);
		expect(reconfigureCustomTools).toHaveBeenCalledTimes(2);
		expect(reconfigureCustomTools.mock.calls[1]?.[0]).toBeInstanceOf(Array);
	});

	it("preserves the unsupported dynamic reconfiguration error", () => {
		const session = {
			isStreaming: false,
			isBashRunning: false,
			sessionManager: { getCwd: () => "C:/workspace" },
		} as unknown as RuntimeSession;
		const controller = new LegacyRuntimeSessionExecutionController(session);

		expect(() => controller.reconfigure({ mode: "full-access", sessionId: "session-1" })).toThrow();
		try {
			controller.reconfigure({ mode: "full-access", sessionId: "session-1" });
		} catch (error) {
			expect(error).toMatchObject({
				code: "INTERNAL_ERROR",
				message: "Session does not support execution mode reconfiguration.",
				retryable: false,
			});
		}
	});
});
