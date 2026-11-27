import { createConversationUserMessage } from "@shared/conversation";
import { deriveAttachments, prepareInputPrompt, toTokenPath } from "@shared/lib/input-tokens";
import { perfSendMark } from "@shared/lib/perf-send";
import {
	activeInputDraftKeyAtom,
	appshotAttachmentAtom,
	attachedImagesAtom,
	browserCapturesAtom,
	clearCurrentSessionInputDraft,
	inputSegmentsAtom,
	inputValueAtom,
	loadSessionInputDraft,
	mentionedFilesAtom,
	persistCurrentSessionInputDraft,
	persistSessionInputDraft,
	type StagedSendInput,
	selectedModelAtom,
} from "@shared/store/atoms";
import type { PromptAttachmentRef } from "@vetta/runtime-core";
import { atom, getDefaultStore } from "jotai";
import { isUserImageFile, nextId } from "./chat-service";
import { dispatchConversationFeed, resetConversationFeed } from "./conversation-feed-store";

const pendingSessionSends = new Map<string, StagedSendInput>();

/** Failed snapshots stay available even when a newer composer draft owns the scope. */
export const stagedSendRecoveriesAtom = atom<ReadonlyMap<string, { draftKey: string | null; staged: StagedSendInput }>>(
	new Map(),
);

function retainForRecovery(staged: StagedSendInput, draftKey = staged.draftKey): void {
	const store = getDefaultStore();
	const recoveries = new Map(store.get(stagedSendRecoveriesAtom));
	recoveries.set(staged.optimisticMessage.id, { draftKey, staged });
	store.set(stagedSendRecoveriesAtom, recoveries);
}

export const recoveryComposerEmptyAtom = atom((get) => {
	return (
		get(inputValueAtom).length === 0 &&
		get(inputSegmentsAtom).every((segment) => segment.kind === "text" && segment.text === "") &&
		get(attachedImagesAtom).length === 0 &&
		get(mentionedFilesAtom).length === 0 &&
		get(appshotAttachmentAtom) === null &&
		get(browserCapturesAtom).length === 0
	);
});

export function restoreRetainedSend(messageId: string, mode: "full" | "captures" | "dismiss"): void {
	const store = getDefaultStore();
	const recoveries = store.get(stagedSendRecoveriesAtom);
	const recovery = recoveries.get(messageId);
	if (!recovery || recovery.draftKey !== store.get(activeInputDraftKeyAtom)) return;
	if (mode === "captures") {
		const existing = store.get(browserCapturesAtom);
		const ids = new Set(existing.map((capture) => capture.id));
		const additions = recovery.staged.browserCaptures?.filter((capture) => !ids.has(capture.id));
		if (additions?.length) {
			store.set(browserCapturesAtom, [...existing, ...additions]);
			persistCurrentSessionInputDraft();
		}
		return;
	}
	if (mode === "full") {
		if (!store.get(recoveryComposerEmptyAtom)) return;
		applyStagedDraft(recovery.staged);
	}
	const next = new Map(recoveries);
	next.delete(messageId);
	store.set(stagedSendRecoveriesAtom, next);
}

function modelKeyToParts(key: string | null | undefined): { provider: string; id: string } | undefined {
	if (!key) return undefined;
	const separator = key.indexOf("/");
	if (separator <= 0) return undefined;
	return { provider: key.slice(0, separator), id: key.slice(separator + 1) };
}

/**
 * Captures and renders a new session's first user turn without requiring a
 * runtimeId. The returned snapshot is the only input used by the later dispatch.
 */
function stageSessionSend(
	overrideText: string | undefined,
	interactionId: string,
	messagePlacement: "append" | "replace",
): StagedSendInput | null {
	const store = getDefaultStore();
	const inputValue = store.get(inputValueAtom);
	const inputSegments = store.get(inputSegmentsAtom).slice();
	const attachedImages = store.get(attachedImagesAtom).slice();
	const mentionedFiles = store.get(mentionedFilesAtom).slice();
	const appshot = store.get(appshotAttachmentAtom);
	const browserCaptures = store.get(browserCapturesAtom).slice();
	const selectedModel = store.get(selectedModelAtom);
	const override = typeof overrideText === "string" ? overrideText.trim() : "";
	const hasOverride = override.length > 0;
	if (
		!hasOverride &&
		!inputValue.trim() &&
		attachedImages.length === 0 &&
		mentionedFiles.length === 0 &&
		!appshot &&
		browserCaptures.length === 0
	) {
		return null;
	}

	const rawText = hasOverride ? override : inputValue.trim();
	const preparedInput = prepareInputPrompt(rawText, hasOverride ? undefined : inputSegments);
	const attachmentsByPath = new Map<string, PromptAttachmentRef>();
	if (!hasOverride) {
		for (const attachment of deriveAttachments(preparedInput.segments)) {
			attachmentsByPath.set(toTokenPath(attachment.path), attachment);
		}
		for (const file of mentionedFiles) {
			const key = toTokenPath(file.path);
			if (attachmentsByPath.has(key)) continue;
			attachmentsByPath.set(key, {
				kind: file.isDirectory ? "directory" : isUserImageFile(file.path) ? "image" : "file",
				path: file.path,
			});
		}
		if (appshot?.imagePath) {
			attachmentsByPath.set(toTokenPath(appshot.imagePath), { kind: "image", path: appshot.imagePath });
		}
		if (appshot?.textPath) {
			attachmentsByPath.set(toTokenPath(appshot.textPath), { kind: "file", path: appshot.textPath });
		}
	}

	for (const capture of hasOverride ? [] : browserCaptures)
		attachmentsByPath.set(toTokenPath(capture.imagePath), { kind: "image", path: capture.imagePath });
	const optimisticMessage = createConversationUserMessage({
		browserCaptures: hasOverride ? [] : browserCaptures,
		id: nextId("user"),
		deliveryPhase: "pending",
		text: hasOverride ? rawText : preparedInput.text,
		...(hasOverride ? {} : { inputSegments: preparedInput.segments }),
		timestamp: Date.now(),
		model: modelKeyToParts(selectedModel),
		attachments: [...attachmentsByPath.values()],
		mentionedFiles,
	});
	if (attachedImages.length > 0) {
		optimisticMessage.images = attachedImages.map((image) => ({
			data: image.data,
			mimeType: image.mimeType,
			name: image.name,
		}));
	}
	if (appshot) optimisticMessage.appshot = appshot;

	if (!hasOverride) {
		clearCurrentSessionInputDraft();
		store.set(attachedImagesAtom, []);
		store.set(mentionedFilesAtom, []);
	}
	if (messagePlacement === "replace") resetConversationFeed(store);
	dispatchConversationFeed({ type: "user.sent", message: optimisticMessage }, store);
	perfSendMark("optimistic-append", interactionId);

	return {
		draftKey: store.get(activeInputDraftKeyAtom),
		rawText,
		inputSegments: [...preparedInput.segments],
		hasOverride,
		attachedImages,
		mentionedFiles,
		appshot,
		browserCaptures,
		selectedModel,
		optimisticMessage,
	};
}

export function stageNewSessionSend(overrideText: string | undefined, interactionId: string): StagedSendInput | null {
	return stageSessionSend(overrideText, interactionId, "replace");
}

/** Captures a send accepted while an existing Session Runtime is still restoring. */
export function stagePendingSessionSend(
	overrideText: string | undefined,
	interactionId: string,
): StagedSendInput | null {
	const staged = stageSessionSend(overrideText, interactionId, "append");
	if (staged) pendingSessionSends.set(staged.optimisticMessage.id, staged);
	return staged;
}

/** Claims a deferred send for dispatch. Null means the user already cancelled it. */
export function takeStagedPendingSessionSend(messageId: string): StagedSendInput | null {
	const staged = pendingSessionSends.get(messageId) ?? null;
	pendingSessionSends.delete(messageId);
	return staged;
}

/** Cancels an accepted-but-not-dispatched send so it can be edited immediately. */
export function cancelStagedPendingSessionSend(messageId: string): StagedSendInput | null {
	return takeStagedPendingSessionSend(messageId);
}

/** Restores a staged draft when runtime creation fails before dispatch. */
export function restoreStagedNewSessionSend(staged: StagedSendInput, draftKey = staged.draftKey): void {
	const store = getDefaultStore();
	if (draftKey !== store.get(activeInputDraftKeyAtom)) {
		if (!staged.hasOverride) retainForRecovery(staged, draftKey);
		return;
	}
	resetConversationFeed(store);
	if (staged.hasOverride) {
		return;
	}
	if (!store.get(recoveryComposerEmptyAtom)) {
		retainForRecovery(staged, draftKey);
		persistCurrentSessionInputDraft();
		return;
	}
	applyStagedDraft(staged);
}

function applyStagedDraft(staged: StagedSendInput): void {
	const store = getDefaultStore();
	store.set(inputSegmentsAtom, staged.inputSegments.slice());
	store.set(inputValueAtom, staged.rawText);
	store.set(attachedImagesAtom, staged.attachedImages.slice());
	store.set(mentionedFilesAtom, staged.mentionedFiles.slice());
	store.set(appshotAttachmentAtom, staged.appshot);
	store.set(browserCapturesAtom, staged.browserCaptures ?? []);
	persistCurrentSessionInputDraft();
}

/**
 * Rolls back a deferred send when its target open fails or is superseded.
 * Only restore into an untouched composer; text entered after the accepted send
 * has priority and must never be overwritten by recovery.
 */
export function restoreStagedPendingSessionSend(
	staged: StagedSendInput,
	options?: { overwriteComposer?: boolean },
): void {
	pendingSessionSends.delete(staged.optimisticMessage.id);
	const store = getDefaultStore();
	dispatchConversationFeed({ type: "user.discarded", id: staged.optimisticMessage.id }, store);
	if (staged.hasOverride) return;
	const activeDraftKey = store.get(activeInputDraftKeyAtom);
	if (activeDraftKey !== staged.draftKey) {
		if (!staged.draftKey || staged.attachedImages.length > 0) {
			retainForRecovery(staged);
			return;
		}
		const targetDraft = loadSessionInputDraft(staged.draftKey);
		if (targetDraft.text || targetDraft.captures?.length || targetDraft.appshot) {
			retainForRecovery(staged);
			return;
		}
		persistSessionInputDraft(staged.draftKey, {
			text: staged.rawText,
			segments: staged.inputSegments.slice(),
			appshot: staged.appshot,
			captures: staged.browserCaptures,
		});
		return;
	}
	if (!store.get(recoveryComposerEmptyAtom) && options?.overwriteComposer !== true) {
		retainForRecovery(staged);
		return;
	}
	applyStagedDraft(staged);
}
