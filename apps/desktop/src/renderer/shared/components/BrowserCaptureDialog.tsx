import { StageDialogContent } from "@vetta-org/theme-ui/shared";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BrowserCapture } from "../../../shared/browser-capture";
import { toVettaFileUrl } from "@shared/lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function BrowserCaptureDialog({
	capture,
	onCancel,
	onSave,
	editing,
}: {
	capture: BrowserCapture;
	onCancel: () => void;
	onSave: (note: string) => void;
	editing?: boolean;
}) {
	const { t } = useTranslation("chat");
	const [note, setNote] = useState(capture.note);
	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
		>
			<StageDialogContent
				artwork={
					<img
						className="max-h-[75vh] w-[min(60vw,900px)] max-w-full rounded-xl object-contain"
						src={toVettaFileUrl(capture.imagePath)}
						alt={t("browserCapture.preview")}
					/>
				}
			>
				<Dialog.Title className="break-words text-xl font-semibold">
					{capture.title || t("browserCapture.preview")}
				</Dialog.Title>
				<Dialog.Description className="mt-2 break-all text-xs text-muted-foreground">{capture.url}</Dialog.Description>
				<p className="my-4 text-xs tabular-nums">
					{capture.width} × {capture.height} PNG
				</p>
				<label className="space-y-2 text-sm">
					{t("browserCapture.note")}
					<Textarea value={note} maxLength={10000} onChange={(event) => setNote(event.target.value)} />
				</label>
				<Button variant="primary" className="mt-6" onClick={() => onSave(note)}>
					{t(editing ? "browserCapture.save" : "browserCapture.add")}
				</Button>
				<Button variant="ghost" className="mt-2" onClick={onCancel}>
					{t("browserCapture.cancel")}
				</Button>
			</StageDialogContent>
		</Dialog.Root>
	);
}
