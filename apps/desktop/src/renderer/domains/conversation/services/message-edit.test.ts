import { describe, expect, it } from "vitest";
import { canEditUserMessage, isEditingUserMessage, messageEditMode, rewindForMessageEdit } from "./message-edit";

describe("message edit rules", () => {
	it("replaces the latest message in place and branches from earlier ones", () => {
		expect(messageEditMode(true)).toBe("replace");
		expect(messageEditMode(false)).toBe("branch");
	});

	it("offers edit on every persisted message and on the optimistic latest one", () => {
		expect(canEditUserMessage({ enabled: true, isLastUserMessage: false, entryId: "entry-1" })).toBe(true);
		expect(canEditUserMessage({ enabled: true, isLastUserMessage: true, entryId: undefined })).toBe(true);
		expect(canEditUserMessage({ enabled: true, isLastUserMessage: false, entryId: undefined })).toBe(false);
		expect(canEditUserMessage({ enabled: false, isLastUserMessage: true, entryId: "entry-1" })).toBe(false);
	});

	it("marks only the message being edited", () => {
		const branch = { entryId: "entry-1", mode: "branch" } as const;
		expect(isEditingUserMessage(branch, "entry-1", false)).toBe(true);
		expect(isEditingUserMessage(branch, "entry-2", true)).toBe(false);
		// An earlier-message edit must not light up the optimistic latest bubble.
		expect(isEditingUserMessage(branch, undefined, true)).toBe(false);
		expect(isEditingUserMessage({ entryId: "entry-9", mode: "replace" }, undefined, true)).toBe(true);
		expect(isEditingUserMessage(null, "entry-1", true)).toBe(false);
	});
});

/** A linear session history: `navigateForEdit` moves the leaf, `replaceLastUserMessage` deletes. */
function fakeHistory(entries: readonly string[]) {
	const state = { entries: [...entries], leaf: entries.at(-1) ?? null };
	return {
		state,
		async navigateForEdit(_sessionId: string, entryId: string) {
			state.leaf = state.entries[state.entries.indexOf(entryId) - 1] ?? null;
		},
		async replaceLastUserMessage(_sessionId: string, entryId: string) {
			state.entries = state.entries.slice(0, state.entries.indexOf(entryId));
			state.leaf = state.entries.at(-1) ?? null;
		},
	};
}

describe("rewindForMessageEdit", () => {
	it("continues from before an earlier message and keeps every later entry", async () => {
		const history = fakeHistory(["user-1", "reply-1", "user-2", "reply-2"]);
		await rewindForMessageEdit(history, "runtime-1", { entryId: "user-1", mode: "branch" });
		expect(history.state).toEqual({ entries: ["user-1", "reply-1", "user-2", "reply-2"], leaf: null });
	});

	it("drops the latest message and its reply", async () => {
		const history = fakeHistory(["user-1", "reply-1", "user-2", "reply-2"]);
		await rewindForMessageEdit(history, "runtime-1", { entryId: "user-2", mode: "replace" });
		expect(history.state).toEqual({ entries: ["user-1", "reply-1"], leaf: "reply-1" });
	});
});
