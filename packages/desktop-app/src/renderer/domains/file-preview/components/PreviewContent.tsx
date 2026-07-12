import {
	AUDIO_EXTENSIONS,
	IMAGE_EXTENSIONS,
	PreviewBodyView,
	VIDEO_EXTENSIONS,
	getExtension,
	getPreviewLabel,
	type FilePreviewItem,
} from "@vetta/theme-ui/file-preview";
import { usePreviewBodyModel } from "../hooks/usePreviewBodyModel";
import { downloadItem, isPreviewSupported } from "../preview-utils";

export {
	AUDIO_EXTENSIONS,
	IMAGE_EXTENSIONS,
	VIDEO_EXTENSIONS,
	getExtension,
	getPreviewLabel,
	downloadItem,
	isPreviewSupported,
};

/**
 * 扩展名 → 预览组件的分发 + 加载状态机 + 文件实时刷新。
 * 内嵌预览（FilePreviewView）与全局灯箱（FilePreviewDialog）共用。
 */
export function PreviewBody({
	item,
	refreshNonce = 0,
}: {
	item: FilePreviewItem;
	refreshNonce?: number;
}): JSX.Element {
	const model = usePreviewBodyModel(item, refreshNonce);
	return <PreviewBodyView {...model} />;
}
