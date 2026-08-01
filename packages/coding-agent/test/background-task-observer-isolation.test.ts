import { describe, expect, it, vi } from "vitest";
import { type BackgroundTaskEvent, BackgroundTaskManager } from "../src/core/background-tasks/index.js";

describe("BackgroundTaskManager observer isolation", () => {
	it("continues fan-out when one listener throws", () => {
		const manager = new BackgroundTaskManager();
		const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
		const observed: BackgroundTaskEvent[] = [];
		manager.subscribe(() => {
			throw new Error("listener failed");
		});
		manager.subscribe((event) => observed.push(event));
		const event: BackgroundTaskEvent = { type: "tasks_cleared" };
		const internals = manager as unknown as { emit(value: BackgroundTaskEvent): void };

		try {
			expect(() => internals.emit(event)).not.toThrow();
			expect(observed).toEqual([event]);
			expect(warnings).toHaveBeenCalledOnce();
		} finally {
			warnings.mockRestore();
		}
	});
});
