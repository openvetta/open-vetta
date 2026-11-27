import type { CaptureRect } from "../../../../shared/browser-capture";

export async function frameBrowserScreenshot(
	data: string,
	rect: CaptureRect,
	viewport: { width: number; height: number },
) {
	const image = new Image();
	image.src = `data:image/png;base64,${data}`;
	await image.decode();
	const canvas = document.createElement("canvas");
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Screenshot compositor unavailable");
	context.drawImage(image, 0, 0);
	const sx = canvas.width / viewport.width,
		sy = canvas.height / viewport.height;
	context.strokeStyle =
		getComputedStyle(document.documentElement).getPropertyValue("--color-browser-selection").trim() || "#008cff";
	context.lineWidth = Math.max(1, 3 * Math.min(sx, sy));
	context.strokeRect(
		rect.x * sx + context.lineWidth / 2,
		rect.y * sy + context.lineWidth / 2,
		Math.max(0, rect.width * sx - context.lineWidth),
		Math.max(0, rect.height * sy - context.lineWidth),
	);
	return { data: canvas.toDataURL("image/png").split(",")[1], width: canvas.width, height: canvas.height };
}
