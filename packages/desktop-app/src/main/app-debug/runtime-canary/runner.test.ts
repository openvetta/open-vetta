import { describe, expect, it, vi } from "vitest";
import {
	RUNTIME_CANARY_FIRST_PROMPT,
	RUNTIME_CANARY_QUESTION,
	RUNTIME_CANARY_QUESTION_PROMPT,
	RUNTIME_CANARY_SECOND_PROMPT,
} from "./contracts.js";
import { runRuntimeCanaryConversation, scheduleRuntimeCanaryQuit } from "./runner.js";

const sessionId = "00000000-0000-4000-8000-000000000001";
const createOperationId = "00000000-0000-4000-8000-000000000002";
const continueOperationId = "00000000-0000-4000-8000-000000000003";
const questionOperationId = "00000000-0000-4000-8000-000000000004";
const interactionId = "00000000-0000-4000-8000-000000000005";
const cwd = "C:/runtime-canary/workspace";
const sessionPath = `${cwd}/.vetta/sessions/session.jsonl`;

describe("Runtime Canary runner", () => {
	it("drives create, continue, list, question and abort through existing Debug capabilities", async () => {
		const invokeDebug = vi.fn(async (debugId: string, input: unknown) => {
			if (debugId === "conversation.create") {
				return completed(createOperationId, "DESKTOP_PROCESS_CANARY_FIRST", 2);
			}
			if (debugId === "conversation.list") return [{ sessionPath, cwd }];
			if (debugId === "conversation.abort") {
				return { operationId: questionOperationId, sessionPath, status: "aborted" };
			}
			const prompt = (input as { prompt?: string }).prompt;
			if (prompt === RUNTIME_CANARY_SECOND_PROMPT) {
				return completed(continueOperationId, "DESKTOP_PROCESS_CANARY_SECOND", 4);
			}
			if (prompt === RUNTIME_CANARY_QUESTION_PROMPT) {
				return {
					operationId: questionOperationId,
					sessionId,
					sessionPath,
					cwd,
					status: "input_required",
					interaction: {
						id: interactionId,
						type: "ask_user_question",
						questions: [{ question: RUNTIME_CANARY_QUESTION }],
					},
				};
			}
			throw new Error(`Unexpected Debug call: ${debugId}`);
		});

		await expect(
			runRuntimeCanaryConversation(invokeDebug, {
				cwd,
				modelKey: "runtime-canary/runtime-canary-model",
			}),
		).resolves.toEqual({ sessionId, sessionPath, questionOperationId });
		expect(invokeDebug).toHaveBeenCalledTimes(5);
		expect(invokeDebug.mock.calls[0]?.[1]).toMatchObject({ prompt: RUNTIME_CANARY_FIRST_PROMPT });
	});

	it("validates the graceful quit acknowledgement", async () => {
		const invokeDebug = vi.fn(async () => ({ status: "scheduled", delayMs: 75 }));
		await expect(scheduleRuntimeCanaryQuit(invokeDebug)).resolves.toBe(75);
	});

	it("accepts completion when question cancellation wins the abort race", async () => {
		const invokeDebug = createCompletedAbortInvoker();
		await expect(
			runRuntimeCanaryConversation(invokeDebug, {
				cwd,
				modelKey: "runtime-canary/runtime-canary-model",
			}),
		).resolves.toMatchObject({ sessionId, sessionPath, questionOperationId });
	});
});

function completed(operationId: string, assistantText: string, messageCount: number) {
	return {
		operationId,
		sessionId,
		sessionPath,
		cwd,
		status: "completed",
		stopReason: "stop",
		assistantText,
		messageCount,
	};
}

function createCompletedAbortInvoker() {
	return vi.fn(async (debugId: string, input: unknown) => {
		if (debugId === "conversation.create") {
			return completed(createOperationId, "DESKTOP_PROCESS_CANARY_FIRST", 2);
		}
		if (debugId === "conversation.list") return [{ sessionPath, cwd }];
		if (debugId === "conversation.abort") return completed(questionOperationId, "", 6);
		const prompt = (input as { prompt?: string }).prompt;
		if (prompt === RUNTIME_CANARY_SECOND_PROMPT) {
			return completed(continueOperationId, "DESKTOP_PROCESS_CANARY_SECOND", 4);
		}
		if (prompt === RUNTIME_CANARY_QUESTION_PROMPT) {
			return {
				operationId: questionOperationId,
				sessionId,
				sessionPath,
				cwd,
				status: "input_required",
				interaction: {
					id: interactionId,
					type: "ask_user_question",
					questions: [{ question: RUNTIME_CANARY_QUESTION }],
				},
			};
		}
		throw new Error(`Unexpected Debug call: ${debugId}`);
	});
}
