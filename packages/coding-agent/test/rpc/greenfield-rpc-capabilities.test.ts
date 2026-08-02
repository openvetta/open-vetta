import { describe, expect, it, vi } from "vitest";
import {
	GreenfieldRpcRetryController,
	type GreenfieldRpcRetryEvent,
} from "../../src/modes/rpc/greenfield-rpc-capabilities.js";

describe("Greenfield RPC capabilities", () => {
	it("retries retryable turn failures without depending on Legacy session state", async () => {
		let enabled = true;
		const events: GreenfieldRpcRetryEvent[] = [];
		const retry = vi
			.fn<() => Promise<{ status: string; error?: { message: string } }>>()
			.mockResolvedValueOnce({ status: "failed", error: { message: "503 service unavailable" } })
			.mockResolvedValueOnce({ status: "completed" });
		const controller = new GreenfieldRpcRetryController({
			readSettings: () => ({ enabled, maxRetries: 2, baseDelayMs: 0 }),
			setEnabled: (value) => {
				enabled = value;
			},
			emit: (event) => events.push(event),
		});

		controller.setAutoRetryEnabled(false);
		expect(enabled).toBe(false);
		controller.setAutoRetryEnabled(true);
		const result = await controller.run(retry, retry, (candidate) => candidate.error?.message);

		expect(result).toEqual({ status: "completed" });
		expect(retry).toHaveBeenCalledTimes(2);
		expect(events).toEqual([
			{
				type: "auto_retry_start",
				attempt: 1,
				maxAttempts: 2,
				delayMs: 0,
				errorMessage: "503 service unavailable",
			},
			{ type: "auto_retry_end", success: true, attempt: 1 },
		]);
	});

	it("does not retry quota exhaustion errors", async () => {
		const execute = vi.fn<() => Promise<{ status: string; error: { message: string } }>>().mockResolvedValue({
			status: "failed",
			error: { message: "429 insufficient quota" },
		});
		const controller = new GreenfieldRpcRetryController({
			readSettings: () => ({ enabled: true, maxRetries: 3, baseDelayMs: 0 }),
			setEnabled: () => {},
			emit: () => {},
		});

		await controller.run(execute, execute, (candidate) => candidate.error?.message);

		expect(execute).toHaveBeenCalledOnce();
	});
});
