import { definePlugin, type PluginFilePreviewProps } from "@vetta/plugin-sdk";
import { AudioPreview } from "./AudioPreview";
import { MEDIA_EXTENSIONS, isAudioExtension, isImageExtension, isVideoExtension } from "./formats";
import { ImagePreview } from "./ImagePreview";
import "./style.css";
import { VideoPreview } from "./VideoPreview";

function MediaPreview({ file }: PluginFilePreviewProps) {
	if (isImageExtension(file.extension)) return <ImagePreview file={file} />;
	if (file.extension === "webm") {
		return file.mime.startsWith("video/") ? <VideoPreview file={file} /> : <AudioPreview file={file} />;
	}
	if (isVideoExtension(file.extension)) return <VideoPreview file={file} />;
	if (isAudioExtension(file.extension)) return <AudioPreview file={file} />;

	return (
		<div className="flex h-full min-h-0 flex-1 items-center justify-center p-8 text-[13px] text-[var(--muted-foreground)]">
			暂不支持预览此媒体格式
		</div>
	);
}

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerFilePreview({
			extensions: MEDIA_EXTENSIONS,
			component: MediaPreview,
		});
	},
});
