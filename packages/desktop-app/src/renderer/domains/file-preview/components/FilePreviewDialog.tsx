import { type FilePreviewItem, filePreviewContextReadonlyAtom } from "@shared/store/atoms";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FilePreviewDialogView } from "./FilePreviewDialogView";
import { usePreviewNav } from "./FilePreviewView";
import { IMAGE_EXTENSIONS, downloadItem, getExtension } from "./PreviewContent";

function isImage(item: FilePreviewItem): boolean {
	return IMAGE_EXTENSIONS.has(getExtension(item.name));
}

/**
 * 全局文件预览灯箱（图片附件等非文件树入口使用）。
 * 全屏纯暗遮罩，通用控制（文件名/下载/打开位置/关闭）浮在遮罩层，弹层自身不出 UI。
 * 文件树点击文件走 inline 内嵌预览，请使用 inlineFilePreviewAtom。
 */
export function FilePreviewDialog(): JSX.Element {
	const { t } = useTranslation("common");
	const [ctx, setCtx] = useAtom(filePreviewContextReadonlyAtom);
	const { goPrev, goNext, close } = usePreviewNav(setCtx);
	const ThemedFilePreviewDialogView = useThemeComponent("root.filePreviewDialogView", FilePreviewDialogView);

	const item = ctx ? (ctx.items[ctx.index] ?? null) : null;
	// 图片组：调用方传入的多张图片（全为图片才启用缩略图条 / 箭头 / 计数）
	const isImageGroup = !!ctx && ctx.items.length > 1 && ctx.items.every(isImage);

	useEffect(() => {
		if (!item) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.preventDefault();
				close();
			} else if (isImageGroup && e.key === "ArrowLeft") {
				e.preventDefault();
				goPrev();
			} else if (isImageGroup && e.key === "ArrowRight") {
				e.preventDefault();
				goNext();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [item, isImageGroup, goPrev, goNext, close]);

	const selectIndex = useCallback(
		(index: number) => setCtx((prev) => (prev ? { ...prev, index } : prev)),
		[setCtx],
	);

	return (
		<ThemedFilePreviewDialogView
			context={ctx}
			isImageGroup={isImageGroup}
			item={item}
			labels={{
				close: t("filePreview.close"),
				download: t("filePreview.download"),
				showInFolder: t("filePreview.showInFolder"),
			}}
			onClose={close}
			onDownload={(previewItem) => void downloadItem(previewItem)}
			onGoNext={goNext}
			onGoPrev={goPrev}
			onSelectIndex={selectIndex}
			onShowInFolder={(path) => void window.vetta.shell.showItemInFolder(path)}
		/>
	);
}
