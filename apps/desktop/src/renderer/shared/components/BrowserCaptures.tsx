import type { BrowserCapture } from "../../../shared/browser-capture";
import { BrowserCaptureCardView } from "@vetta-org/theme-ui/chat";
import { useAtom, useSetAtom } from "jotai";
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
	return <BrowserCaptureCards captures={captures} onChange={setCaptures} />;
}
