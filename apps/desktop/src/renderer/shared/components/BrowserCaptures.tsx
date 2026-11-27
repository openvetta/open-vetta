import type { BrowserCapture } from "../../../shared/browser-capture";
import { BrowserCaptureCardView } from "@vetta-org/theme-ui/chat";
import { useAtom, useSetAtom } from "jotai";
import { useState } from "react";
import { BrowserCaptureDialog } from "./BrowserCaptureDialog";
import { AttachmentThumbnail } from "./AttachmentThumbnail";
import { useTranslation } from "react-i18next";
import { toVettaFileUrl } from "@shared/lib/utils";
import { browserCapturesAtom, filePreviewAtom } from "@shared/store/atoms";

export function BrowserCaptureCards({
	captures,
	onChange,
}: {
	captures: readonly BrowserCapture[];
	onChange?: (next: BrowserCapture[]) => void;
}) {
	const { t } = useTranslation("chat");
	const setPreview = useSetAtom(filePreviewAtom);
	const labels = {
		preview: t("browserCapture.preview"),
		note: t("browserCapture.note"),
		remove: t("browserCapture.remove"),
		unavailable: t("browserCapture.unavailable"),
	};
	return (
		<div className="flex flex-col gap-2">
			{captures.map((capture) => (
				<BrowserCaptureCardView
					key={capture.id}
					src={toVettaFileUrl(capture.imagePath)}
					title={capture.title || capture.url}
					note={capture.note}
					labels={labels}
					onPreview={() => setPreview({ name: capture.title, path: capture.imagePath, kind: "image" })}
					onNoteChange={
						onChange
							? (note) => onChange(captures.map((item) => (item.id === capture.id ? { ...item, note } : item)))
							: undefined
					}
					onRemove={onChange ? () => onChange(captures.filter((item) => item.id !== capture.id)) : undefined}
				/>
			))}
		</div>
	);
}

export function BrowserCaptureDraftCards() {
	const [captures, setCaptures] = useAtom(browserCapturesAtom);
	const { t } = useTranslation("chat");
	return (
		<>
			{captures.map((capture) => (
				<DraftThumbnail
					key={capture.id}
					capture={capture}
					removeLabel={t("browserCapture.remove")}
					onRemove={() => setCaptures((items) => items.filter((item) => item.id !== capture.id))}
					onSave={(note) =>
						setCaptures((items) => items.map((item) => (item.id === capture.id ? { ...item, note } : item)))
					}
				/>
			))}
		</>
	);
}

function DraftThumbnail({
	capture,
	removeLabel,
	onRemove,
	onSave,
}: {
	capture: BrowserCapture;
	removeLabel: string;
	onRemove: () => void;
	onSave: (note: string) => void;
}) {
	const [editing, setEditing] = useState(false);
	return (
		<>
			<AttachmentThumbnail
				name={capture.title || capture.url}
				src={toVettaFileUrl(capture.imagePath)}
				badge={<span className="icon-[mdi--web] size-3" />}
				removeLabel={removeLabel}
				onRemove={onRemove}
				onOpen={() => setEditing(true)}
			/>
			{editing && (
				<BrowserCaptureDialog
					editing
					capture={capture}
					onCancel={() => setEditing(false)}
					onSave={(note) => {
						onSave(note);
						setEditing(false);
					}}
				/>
			)}
		</>
	);
}
