import { FILE_EDITOR_SAVE_EVENT } from "@/shared/shortcuts";
import { FS_EDITABLE_TEXT_ERROR } from "@/preload/fs-types";
import { getExtension } from "@vetta-org/theme-ui/file-preview/types";
import { TextFileEditorView } from "@vetta-org/theme-ui/file-preview/TextFileEditorView";
import type { FilePreviewItem, TextFileEditorMode, TextFileEditorViewState } from "@vetta-org/theme-ui/file-preview";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTextFileEditor } from "../hooks/useTextFileEditor";
import { isRenderedPreviewExtension, RENDERED_PREVIEW_SIZE_LIMIT, TextPreviewRenderer } from "./TextPreviewRenderer";

function resolvePreviewExtension(item: FilePreviewItem): string {
	return getExtension(item.name) || (item.path ? getExtension(item.path) : "");
}

/** Formats with a real rendered surface (not just re-showing source). */
function hasRenderedPreview(extension: string): boolean {
	return isRenderedPreviewExtension(extension);
}

function defaultEditorMode(extension: string): TextFileEditorMode {
	return hasRenderedPreview(extension) ? "preview" : "edit";
}

export function EditableTextFileView({
	item,
	refreshNonce,
}: {
	item: FilePreviewItem & { path: string };
	refreshNonce: number;
}): JSX.Element {
	const { t } = useTranslation("chat");
	const extension = resolvePreviewExtension(item);
	// null = not chosen by the user yet; the default then depends on the loaded size.
	const [chosenMode, setMode] = useState<TextFileEditorMode | null>(null);
	const model = useTextFileEditor(item.path, refreshNonce);
	const { document } = model;

	useEffect(() => {
		setMode(null);
	}, [item.path, item.name]);

	// A huge Markdown/HTML file opens on its source: rendering it whole would freeze the
	// window. The user can still switch to the preview themselves.
	// Decided once per file when it loads, so editing across the limit never flips the view.
	const loadedModeRef = useRef<{ path: string; mode: TextFileEditorMode } | null>(null);
	if (document && loadedModeRef.current?.path !== item.path) {
		loadedModeRef.current = {
			path: item.path,
			mode: document.draftContent.length > RENDERED_PREVIEW_SIZE_LIMIT ? "edit" : defaultEditorMode(extension),
		};
	}
	const mode = chosenMode ?? loadedModeRef.current?.mode ?? defaultEditorMode(extension);

	useEffect(() => {
		const handleSave = () => void model.save();
		window.addEventListener(FILE_EDITOR_SAVE_EVENT, handleSave);
		return () => window.removeEventListener(FILE_EDITOR_SAVE_EVENT, handleSave);
	}, [model.save]);

	const getErrorText = (error: unknown): string => {
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes(FS_EDITABLE_TEXT_ERROR.TOO_LARGE)) return t("fileEditor.errorTooLarge");
		if (message.includes(FS_EDITABLE_TEXT_ERROR.NOT_UTF8)) return t("fileEditor.errorNotUtf8");
		return t("fileEditor.errorRead");
	};

	let state: TextFileEditorViewState;
	if (!document) {
		state =
			model.loadStatus === "error"
				? { status: "error", message: getErrorText(model.loadError) }
				: { status: "loading" };
	} else {
		const rendered = hasRenderedPreview(extension);
		state = {
			status: "ready",
			// Source-only formats always stay in edit even if mode state is stale.
			mode: rendered ? mode : "edit",
			statusLabel: model.saving
				? t("fileEditor.saving")
				: model.dirty
					? t("fileEditor.unsaved")
					: t("fileEditor.saved"),
			dirty: model.dirty,
			saving: model.saving,
			hasConflict: Boolean(document.conflictRevision),
			conflictMessage: t("fileEditor.conflict"),
			inlineError: model.saveError
				? t("fileEditor.errorSave")
				: model.loadStatus === "error"
					? getErrorText(model.loadError)
					: undefined,
			// Stable across save (revision changes); remount only when buffer is replaced from disk.
			documentKey: `${item.path}:${document.editorGeneration}`,
			content: document.draftContent,
			extension,
			lineEnding: document.lineEnding,
			previewContent: rendered ? (
				<TextPreviewRenderer
					content={document.draftContent}
					extension={extension}
					sourcePath={item.path}
					renderLargeDocuments
				/>
			) : undefined,
		};
	}

	return (
		<TextFileEditorView
			state={state}
			labels={{
				loading: t("fileEditor.loading"),
				edit: t("fileEditor.edit"),
				preview: t("fileEditor.preview"),
				save: t("fileEditor.save"),
				reload: t("fileEditor.reload"),
				overwrite: t("fileEditor.overwrite"),
			}}
			onModeChange={setMode}
			onChange={model.updateDraft}
			onSave={() => void model.save()}
			onReload={() => void model.reloadFromDisk()}
			onOverwrite={() => void model.save(true)}
		/>
	);
}
