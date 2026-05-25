import type { ImageContent } from "@mariozechner/pi-ai";
import { loadPhoton } from "./photon.js";

let warnedNoPhoton = false;
const DEBUG_RESIZE = process.env.DEBUG_IMAGE_RESIZE === "1" || process.env.DEBUG_IMAGE_RESIZE === "true";

export interface ImageResizeOptions {
	maxWidth?: number; // Default: 1280
	maxHeight?: number; // Default: 1280
	maxBytes?: number; // Default: 2MB
	jpegQuality?: number; // Default: 70
}

export interface ResizedImage {
	data: string; // base64
	mimeType: string;
	originalWidth: number;
	originalHeight: number;
	width: number;
	height: number;
	wasResized: boolean;
}

export interface ImageResizeFailure {
	failed: true;
	mimeType: string;
	originalSizeBytes: number;
	reason: "processor_unavailable" | "processing_failed";
	message: string;
}

export type ImageResizeResult = ResizedImage | ImageResizeFailure;

// 2MB - conservative default tuned for local/open-source VL models whose
// GPU memory budget is dominated by visual token count rather than raw bytes.
// Anthropic Claude tolerates up to 5MB; if you exclusively target Claude you
// can raise this via ReadToolOptions.
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

const DEFAULT_OPTIONS: Required<ImageResizeOptions> = {
	maxWidth: 1280,
	maxHeight: 1280,
	maxBytes: DEFAULT_MAX_BYTES,
	jpegQuality: 70,
};

/** Helper to pick the smaller of two buffers */
function pickSmaller(
	a: { buffer: Uint8Array; mimeType: string },
	b: { buffer: Uint8Array; mimeType: string },
): { buffer: Uint8Array; mimeType: string } {
	return a.buffer.length <= b.buffer.length ? a : b;
}

function debugLog(result: ResizedImage, originalBytes: number): ResizedImage {
	if (DEBUG_RESIZE) {
		const finalBytes = Math.round((result.data.length * 3) / 4);
		console.warn(
			`[image-resize] ${result.originalWidth}x${result.originalHeight} (${originalBytes}B) → ${result.width}x${result.height} (~${finalBytes}B ${result.mimeType}) wasResized=${result.wasResized}`,
		);
	}
	return result;
}

export function isImageResizeFailure(result: ImageResizeResult): result is ImageResizeFailure {
	return "failed" in result;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
	const units = ["B", "KB", "MB", "GB"];
	let value = bytes;
	let unitIndex = 0;
	while (value >= 1024 && unitIndex < units.length - 1) {
		value /= 1024;
		unitIndex++;
	}
	return unitIndex === 0 ? `${bytes} ${units[unitIndex]}` : `${value.toFixed(1)} ${units[unitIndex]}`;
}

function describeError(err: unknown): string {
	if (err instanceof Error) {
		return [err.name, err.message, err.stack].filter(Boolean).join(": ");
	}
	return String(err);
}

function createFailure(
	inputBuffer: Buffer,
	mimeType: string,
	reason: ImageResizeFailure["reason"],
	logMessage: string,
): ImageResizeFailure {
	return {
		failed: true,
		mimeType,
		originalSizeBytes: inputBuffer.length,
		reason,
		message: `${logMessage} The original image was omitted instead of being sent to the model because it may be too large for the vision backend.`,
	};
}

export function formatImageResizeFailureNote(result: ImageResizeFailure, label = "image"): string {
	const reason =
		result.reason === "processor_unavailable"
			? "the image processor is unavailable"
			: "image processing failed before a safe model-sized image could be produced";
	return `[Image omitted: ${label} was not sent to the model because ${reason}. Original: ${result.mimeType}, ${formatBytes(result.originalSizeBytes)}. Check the application logs for the detailed processing error.]`;
}

/**
 * Resize an image to fit within the specified max dimensions and file size.
 * Returns the original image if it already fits within the limits.
 *
 * Uses Photon (Rust/WASM) for image processing. If Photon is not available or
 * processing fails, returns a failure result instead of forwarding the original
 * image to the model.
 *
 * Strategy for staying under maxBytes:
 * 1. First resize to maxWidth/maxHeight
 * 2. Try both PNG and JPEG formats, pick the smaller one
 * 3. If still too large, try JPEG with decreasing quality
 * 4. If still too large, progressively reduce dimensions
 */
export async function resizeImage(img: ImageContent, options?: ImageResizeOptions): Promise<ImageResizeResult> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const inputBuffer = Buffer.from(img.data, "base64");

	const photon = await loadPhoton();
	if (!photon) {
		if (!warnedNoPhoton) {
			warnedNoPhoton = true;
			console.warn(
				`[image-resize] Skipping image: Photon unavailable. Image (${inputBuffer.length} bytes, ${img.mimeType}) will be omitted instead of being sent at original resolution.`,
			);
		}
		return createFailure(
			inputBuffer,
			img.mimeType,
			"processor_unavailable",
			"Photon image processor is unavailable.",
		);
	}

	let image: ReturnType<typeof photon.PhotonImage.new_from_byteslice> | undefined;
	try {
		image = photon.PhotonImage.new_from_byteslice(new Uint8Array(inputBuffer));

		const originalWidth = image.get_width();
		const originalHeight = image.get_height();
		const format = img.mimeType?.split("/")[1] ?? "png";

		// Check if already within all limits (dimensions AND size)
		const originalSize = inputBuffer.length;
		if (originalWidth <= opts.maxWidth && originalHeight <= opts.maxHeight && originalSize <= opts.maxBytes) {
			return debugLog(
				{
					data: img.data,
					mimeType: img.mimeType ?? `image/${format}`,
					originalWidth,
					originalHeight,
					width: originalWidth,
					height: originalHeight,
					wasResized: false,
				},
				inputBuffer.length,
			);
		}

		// Calculate initial dimensions respecting max limits
		let targetWidth = originalWidth;
		let targetHeight = originalHeight;

		if (targetWidth > opts.maxWidth) {
			targetHeight = Math.round((targetHeight * opts.maxWidth) / targetWidth);
			targetWidth = opts.maxWidth;
		}
		if (targetHeight > opts.maxHeight) {
			targetWidth = Math.round((targetWidth * opts.maxHeight) / targetHeight);
			targetHeight = opts.maxHeight;
		}

		// Helper to resize and encode in both formats, returning the smaller one
		function tryBothFormats(
			width: number,
			height: number,
			jpegQuality: number,
		): { buffer: Uint8Array; mimeType: string } {
			const resized = photon!.resize(image!, width, height, photon!.SamplingFilter.Lanczos3);

			try {
				const pngBuffer = resized.get_bytes();
				const jpegBuffer = resized.get_bytes_jpeg(jpegQuality);

				return pickSmaller(
					{ buffer: pngBuffer, mimeType: "image/png" },
					{ buffer: jpegBuffer, mimeType: "image/jpeg" },
				);
			} finally {
				resized.free();
			}
		}

		// Try to produce an image under maxBytes
		const qualitySteps = [85, 70, 55, 40];
		const scaleSteps = [1.0, 0.75, 0.5, 0.35, 0.25];

		let best: { buffer: Uint8Array; mimeType: string };
		let finalWidth = targetWidth;
		let finalHeight = targetHeight;

		// First attempt: resize to target dimensions, try both formats
		best = tryBothFormats(targetWidth, targetHeight, opts.jpegQuality);

		if (best.buffer.length <= opts.maxBytes) {
			return debugLog(
				{
					data: Buffer.from(best.buffer).toString("base64"),
					mimeType: best.mimeType,
					originalWidth,
					originalHeight,
					width: finalWidth,
					height: finalHeight,
					wasResized: true,
				},
				inputBuffer.length,
			);
		}

		// Still too large - try JPEG with decreasing quality
		for (const quality of qualitySteps) {
			best = tryBothFormats(targetWidth, targetHeight, quality);

			if (best.buffer.length <= opts.maxBytes) {
				return debugLog(
					{
						data: Buffer.from(best.buffer).toString("base64"),
						mimeType: best.mimeType,
						originalWidth,
						originalHeight,
						width: finalWidth,
						height: finalHeight,
						wasResized: true,
					},
					inputBuffer.length,
				);
			}
		}

		// Still too large - reduce dimensions progressively
		for (const scale of scaleSteps) {
			finalWidth = Math.round(targetWidth * scale);
			finalHeight = Math.round(targetHeight * scale);

			if (finalWidth < 100 || finalHeight < 100) {
				break;
			}

			for (const quality of qualitySteps) {
				best = tryBothFormats(finalWidth, finalHeight, quality);

				if (best.buffer.length <= opts.maxBytes) {
					return debugLog(
						{
							data: Buffer.from(best.buffer).toString("base64"),
							mimeType: best.mimeType,
							originalWidth,
							originalHeight,
							width: finalWidth,
							height: finalHeight,
							wasResized: true,
						},
						inputBuffer.length,
					);
				}
			}
		}

		// Last resort: return smallest version we produced
		return debugLog(
			{
				data: Buffer.from(best.buffer).toString("base64"),
				mimeType: best.mimeType,
				originalWidth,
				originalHeight,
				width: finalWidth,
				height: finalHeight,
				wasResized: true,
			},
			inputBuffer.length,
		);
	} catch (err) {
		const detail = describeError(err);
		console.warn(
			`[image-resize] Resize failed (${inputBuffer.length} bytes, ${img.mimeType}); image omitted instead of passing through at ORIGINAL resolution. Error: ${detail}`,
		);
		return createFailure(inputBuffer, img.mimeType, "processing_failed", "Image processing failed.");
	} finally {
		if (image) {
			image.free();
		}
	}
}

/**
 * Format a dimension note for resized images.
 * This helps the model understand the coordinate mapping.
 */
export function formatDimensionNote(result: ResizedImage): string | undefined {
	if (!result.wasResized) {
		return undefined;
	}

	const scale = result.originalWidth / result.width;
	return `[Image: original ${result.originalWidth}x${result.originalHeight}, displayed at ${result.width}x${result.height}. Multiply coordinates by ${scale.toFixed(2)} to map to original image.]`;
}
