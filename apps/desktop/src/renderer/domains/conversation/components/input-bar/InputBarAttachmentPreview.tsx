import { AttachmentThumbnail } from "@shared/components/AttachmentThumbnail";
import { BrowserCaptureDraftCards } from "@shared/components/BrowserCaptures";
import type { AppshotAttachment } from "@shared/store/atoms";
import { AppshotCard } from "../AppshotCard";

export interface InputBarAttachmentPreviewProps {
	readonly open: boolean;
	readonly renderContent: boolean;
	readonly className?: string;
	readonly pendingMessageEdit: boolean;
	readonly pendingEditHint: string;
	readonly cancelPendingEditLabel: string;
	readonly appshotAttachment: AppshotAttachment | null;
	readonly images: ReadonlyArray<{
		readonly path: string;
		readonly name: string;
		readonly url: string;
		readonly label: string;
	}>;
	readonly removeImageLabel: string;
	readonly onCancelPendingEdit: () => void;
	readonly onRemoveAppshot: () => void;
	readonly onOpenImagePreview: (index: number) => void;
	readonly onRemoveImage: (path: string) => void;
}

/** Non-inline attachment previews rendered above the editor. */
export function InputBarAttachmentPreview({
	open,
	renderContent,
	className,
	pendingMessageEdit,
	pendingEditHint,
	cancelPendingEditLabel,
	appshotAttachment,
	images,
	removeImageLabel,
	onCancelPendingEdit,
	onRemoveAppshot,
	onOpenImagePreview,
	onRemoveImage,
}: InputBarAttachmentPreviewProps): JSX.Element {
	return (
		<div
			aria-hidden={!open}
			className="grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none"
			style={{
				gridTemplateRows: open ? "1fr" : "0fr",
				opacity: open ? 1 : 0,
			}}
		>
			<div className="min-h-0 overflow-hidden rounded-t-[inherit]">
				{renderContent ? (
					<div className={["space-y-1.5 px-3 pt-3", className].filter(Boolean).join(" ")}>
						{pendingMessageEdit ? (
							<div className="flex items-center justify-between gap-2 rounded-md border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[11px] text-primary">
								<span className="min-w-0 flex-1 leading-snug">{pendingEditHint}</span>
								<button
									type="button"
									onClick={onCancelPendingEdit}
									className="shrink-0 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
								>
									{cancelPendingEditLabel}
								</button>
							</div>
						) : null}

						{appshotAttachment ? <AppshotCard data={appshotAttachment} onRemove={onRemoveAppshot} /> : null}

						{/* 图片缩略图行：文本流里对应「图 N」胶囊，编号在角标上复现 */}
						<div className="flex flex-wrap items-center gap-1.5">
							{images.map((image, index) => (
								<AttachmentThumbnail
									key={image.path}
									name={image.name}
									src={image.url}
									badge={image.label}
									removeLabel={removeImageLabel}
									onOpen={() => onOpenImagePreview(index)}
									onRemove={() => onRemoveImage(image.path)}
								/>
							))}
							<BrowserCaptureDraftCards />
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
