import { describe, expect, it } from "vitest";
import {
	applyStoredEventToConversationDocument,
	createEmptyConversationDocument,
	projectConversationDocumentHistory,
} from "../../src/conversation/index.js";

describe("prompt resource history projection", () => {
	it("lifts skill_expansion details.promptRef into the next user message marker", () => {
		let document = createEmptyConversationDocument({ sessionId: "session-1", createdAt: 0 });
		document = applyStoredEventToConversationDocument(
			document,
			{
				type: "context.appended",
				sessionId: "session-1",
				turnId: "turn-1",
				record: {
					type: "skill_expansion",
					content: '<skill name="improve-codebase-architecture">deepen</skill>',
					modelVisible: true,
					display: false,
					metadata: { promptRef: { kind: "skill", name: "improve-codebase-architecture" } },
				},
				timestamp: 1,
			},
			1,
		);
		document = applyStoredEventToConversationDocument(
			document,
			{
				type: "message.appended",
				sessionId: "session-1",
				turnId: "turn-1",
				message: { role: "user", content: "scan the hot spots", timestamp: 2 },
				timestamp: 2,
			},
			2,
		);

		expect(projectConversationDocumentHistory(document)).toEqual([
			{
				type: "prompt_ref_marker",
				promptRef: { kind: "skill", name: "improve-codebase-architecture" },
				timestamp: expect.any(String),
			},
			expect.objectContaining({
				type: "message",
				message: expect.objectContaining({ role: "user", content: "scan the hot spots" }),
			}),
		]);
	});

	it("lifts scene_expansion details.promptRef the same way", () => {
		let document = createEmptyConversationDocument({ sessionId: "session-1", createdAt: 0 });
		document = applyStoredEventToConversationDocument(
			document,
			{
				type: "context.appended",
				sessionId: "session-1",
				turnId: "turn-1",
				record: {
					type: "scene_expansion",
					content: '<scene name="review"></scene>',
					modelVisible: true,
					display: false,
					metadata: { promptRef: { kind: "scene", name: "review" } },
				},
				timestamp: 1,
			},
			1,
		);
		document = applyStoredEventToConversationDocument(
			document,
			{
				type: "message.appended",
				sessionId: "session-1",
				turnId: "turn-1",
				message: { role: "user", content: "check the diff", timestamp: 2 },
				timestamp: 2,
			},
			2,
		);

		expect(projectConversationDocumentHistory(document)[0]).toEqual({
			type: "prompt_ref_marker",
			promptRef: { kind: "scene", name: "review" },
			timestamp: expect.any(String),
		});
	});
});
