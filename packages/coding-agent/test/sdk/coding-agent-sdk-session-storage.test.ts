import type { UserMessage } from "@vetta/ai";
import { describe, expect, it } from "vitest";
import { SessionManager } from "../../src/core/session-manager/index.js";
import {
	CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES,
	prepareCodingAgentSdkSessionStorage,
} from "../../src/host/coding-agent-sdk-session-storage.js";

describe("Coding Agent SDK session storage adapter", () => {
	it("maps an empty Legacy in-memory manager without changing persistence", async () => {
		const sessionManager = SessionManager.inMemory("C:\\workspace");
		const prepared = await prepareCodingAgentSdkSessionStorage({
			cwd: "C:\\workspace",
			sessionManager,
		});

		expect(prepared.storage).toEqual({ kind: "memory", sessionId: sessionManager.getSessionId() });
		expect(prepared.history?.context.messages).toEqual([]);
	});

	it("rejects populated Legacy memory instead of dropping history or writing it to disk", async () => {
		const sessionManager = SessionManager.inMemory("C:\\workspace");
		sessionManager.appendMessage(userMessage("Keep this in memory"));

		await expect(prepareCodingAgentSdkSessionStorage({ cwd: "C:\\workspace", sessionManager })).rejects.toMatchObject(
			{
				code: CODING_AGENT_SDK_STORAGE_ADAPTER_ERROR_CODES.IN_MEMORY_HISTORY_UNSUPPORTED,
			},
		);
	});
});

function userMessage(text: string): UserMessage {
	return { role: "user", content: text, timestamp: 1 };
}
