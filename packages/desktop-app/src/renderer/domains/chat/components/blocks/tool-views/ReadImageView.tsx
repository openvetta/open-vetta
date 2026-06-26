import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ToolImagePreview } from "@shared/store/atoms";
import { formatBytes, formatDimensions } from "./shared/format";

export function ReadImageView({ image }: { image: ToolImagePreview }): JSX.Element {
	const { t } = useTranslation("chat");
	const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
	const processedWidth = image.processedWidth && image.processedWidth > 0 ? image.processedWidth : naturalSize?.width;
	const processedHeight =
		image.processedHeight && image.processedHeight > 0 ? image.processedHeight : naturalSize?.height;
	const originalWidth = image.originalWidth && image.originalWidth > 0 ? image.originalWidth : undefined;
	const originalHeight = image.originalHeight && image.originalHeight > 0 ? image.originalHeight : undefined;
	const wasProcessed = image.wasResized === true;

	const openOriginal = (): void => {
		if (!image.originalPath) return;
		void window.vetta.shell.showItemInFolder(image.originalPath);
	};

	return (
		<div className="space-y-2">
			<div className="overflow-hidden rounded-md border border-muted-foreground/10 bg-muted/20">
				<img
					src={`data:${image.mimeType};base64,${image.data}`}
					alt={t("imagePreview.altText")}
					className="max-h-[420px] max-w-full object-contain"
					onLoad={(event) => {
						const img = event.currentTarget;
						setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
					}}
				/>
			</div>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground/55">
				<span>
					{wasProcessed ? t("imagePreview.processedLabel") : t("imagePreview.imageLabel")}{" "}
					{formatDimensions(processedWidth, processedHeight)} ·{" "}
					{formatBytes(image.processedSizeBytes)}
				</span>
				{wasProcessed && (originalWidth !== undefined || image.originalSizeBytes !== undefined) && (
					<span>
						{t("imagePreview.originalLabel")} {formatDimensions(originalWidth, originalHeight)} ·{" "}
							{formatBytes(image.originalSizeBytes)}
					</span>
				)}
				{image.originalPath && (
					<button
						type="button"
						onClick={openOriginal}
						className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-primary/75 hover:bg-primary/10"
						title={image.originalPath}
					>
						<span className="icon-[mdi--folder-eye-outline] h-3 w-3" />
						<span>{t("imagePreview.showInFolderButton")}</span>
					</button>
				)}
			</div>
		</div>
	);
}
