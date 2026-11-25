import type { PendingMessageEdit } from "@shared/store/atoms";

export type MessageEditMode = PendingMessageEdit["mode"];

/**
 * The latest user message is replaced in place together with its reply. An earlier
 * one branches instead: a replacement there would silently destroy every later turn.
 */
export function messageEditMode(isLastUserMessage: boolean): MessageEditMode {
	return isLastUserMessage ? "replace" : "branch";
}

/**
 * Earlier messages need their durable entry id to branch from. The latest one may
 * still be optimistic; its edit resolves the entry id (or cancels the staged send) on click.
 */
export function canEditUserMessage(input: {
	readonly enabled: boolean;
	readonly isLastUserMessage: boolean;
	readonly entryId: string | undefined;
}): boolean {
	return input.enabled && (input.isLastUserMessage || Boolean(input.entryId));
}

export function isEditingUserMessage(
	pending: PendingMessageEdit | null,
	entryId: string | undefined,
	isLastUserMessage: boolean,
): boolean {
	if (!pending) return false;
	if (entryId) return pending.entryId === entryId;
	// An optimistic latest bubble has no entry id yet; its edit resolved one from history.
	return isLastUserMessage && pending.mode === "replace";
}

interface MessageEditHistoryApi {
	replaceLastUserMessage(sessionId: string, entryId: string): Promise<unknown>;
	navigateForEdit(sessionId: string, entryId: string): Promise<unknown>;
}

/**
 * Rewinds the session to just before the edited message so the next prompt continues
 * from there. Only the conversation moves; workspace files are left as they are.
 */
export async function rewindForMessageEdit(
	api: MessageEditHistoryApi,
	runtimeId: string,
	edit: PendingMessageEdit,
): Promise<void> {
	if (edit.mode === "branch") {
		await api.navigateForEdit(runtimeId, edit.entryId);
		return;
	}
	await api.replaceLastUserMessage(runtimeId, edit.entryId);
}
