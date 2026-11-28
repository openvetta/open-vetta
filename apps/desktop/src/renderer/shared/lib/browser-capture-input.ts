import type { ImageContent } from "@vetta/ai";
import type { BrowserCapture } from "../../../shared/browser-capture";
import { toVettaFileUrl } from "./utils";

/** Load the immutable captured files before clearing the draft or admitting a turn. */
export async function loadBrowserCaptureImages(captures: readonly BrowserCapture[]): Promise<ImageContent[]> {
	const images: ImageContent[] = [];
	let total = 0;
	for (const capture of captures) {
		const response = await fetch(toVettaFileUrl(capture.imagePath));
		if (!response.ok) throw new Error("Browser screenshot is unavailable");
		const blob = await response.blob();
		total += Math.ceil(blob.size / 3) * 4;
		if (total > 12 * 1024 * 1024) throw new Error("BROWSER_CAPTURE_BUDGET");
		const data = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onerror = () => reject(new Error("Browser screenshot could not be read"));
			reader.onload = () =>
				typeof reader.result === "string"
					? resolve(reader.result.slice(reader.result.indexOf(",") + 1))
					: reject(new Error("Invalid screenshot"));
			reader.readAsDataURL(blob);
		});
		images.push({ type: "image", data, mimeType: "image/png" });
	}
	return images;
}
