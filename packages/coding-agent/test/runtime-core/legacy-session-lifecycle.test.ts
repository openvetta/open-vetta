import { describe, expect, it, vi } from "vitest";
import { LegacyRuntimeSessionIdentityLifecycle } from "../../src/adapters/runtime-core/legacy-session-ports.js";
import type { AgentSession } from "../../src/core/agent-session.js";

describe("LegacyRuntimeSessionIdentityLifecycle", () => {
	it("waits for AgentSession.close before completing disposal", async () => {
		let releaseClose: (() => void) | undefined;
		const close = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					releaseClose = resolve;
				}),
		);
		const dispose = vi.fn();
		const session = {
			sessionId: "legacy-session",
			sessionFile: "legacy-session.jsonl",
			close,
			dispose,
		} as unknown as AgentSession;
		const lifecycle = new LegacyRuntimeSessionIdentityLifecycle(session);

		let completed = false;
		const disposing = lifecycle.dispose().then(() => {
			completed = true;
		});
		await Promise.resolve();

		expect(close).toHaveBeenCalledOnce();
		expect(dispose).not.toHaveBeenCalled();
		expect(completed).toBe(false);

		releaseClose?.();
		await disposing;
		expect(completed).toBe(true);
	});
});
