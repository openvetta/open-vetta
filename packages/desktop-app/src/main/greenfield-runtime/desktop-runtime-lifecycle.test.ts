import { describe, expect, it } from "vitest";
import { DesktopRuntimeLifecycle } from "./desktop-runtime-lifecycle.js";

describe("DesktopRuntimeLifecycle", () => {
	it("allows one runtime to become active before shutdown", () => {
		const lifecycle = new DesktopRuntimeLifecycle();

		lifecycle.assertCanAccessRuntime();
		lifecycle.markRunning();

		expect(lifecycle.state).toBe("running");
		lifecycle.assertCanAccessRuntime();
	});

	it("fails closed as soon as shutdown begins", () => {
		const lifecycle = new DesktopRuntimeLifecycle();
		lifecycle.markRunning();

		lifecycle.beginShutdown();
		lifecycle.beginShutdown();

		expect(lifecycle.state).toBe("stopping");
		expect(() => lifecycle.assertCanAccessRuntime()).toThrowError("Desktop RuntimeHost is stopping");

		lifecycle.markStopped();
		lifecycle.beginShutdown();

		expect(lifecycle.state).toBe("stopped");
		expect(() => lifecycle.assertCanAccessRuntime()).toThrowError("Desktop RuntimeHost is stopped");
	});
});
