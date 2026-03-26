import { ZoomableView } from "./ZoomableView";

const MIME_MAP: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
};

interface ImagePreviewProps {
	content: string;
	extension: string;
}

export function ImagePreview({ content, extension }: ImagePreviewProps): JSX.Element {
	const mime = MIME_MAP[extension] ?? "image/png";
	return (
		<ZoomableView>
			<div className="flex items-center justify-center p-4">
				<img
					src={`data:${mime};base64,${content}`}
					alt="preview"
					className="max-w-full rounded-md"
					draggable={false}
				/>
			</div>
		</ZoomableView>
	);
}
