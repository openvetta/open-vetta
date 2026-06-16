import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../../extensions/types.js";

/** A reference to an image produced by the host image backend (bytes stored out-of-band). */
export interface ImageToolRef {
	id: string;
	url: string;
	mimeType: string;
	/**
	 * The edit-lineage root id this image belongs to (base image + all its edits
	 * share one rootId). Carried in the result marker so the host can dedup the
	 * per-message preview: only the latest message producing a given rootId
	 * renders the version swiper.
	 */
	rootId: string;
}

/**
 * Host-provided image backend. The agent's generate_image / edit_image tools are
 * thin wrappers over this; the host (desktop) implements it against its
 * main-process image service. coding-agent never depends on the host implementation.
 */
export interface ImageToolBackend {
	generate(input: { prompt: string; size?: string; sessionId?: string }): Promise<ImageToolRef[]>;
	/** Image-to-image: edit an existing host image (by id), appending a new lineage version. */
	edit(input: { prompt: string; sourceImageId: string; size?: string; sessionId?: string }): Promise<ImageToolRef[]>;
}

export interface GenerateImageToolDetails {
	images: ImageToolRef[];
}

/** Markers wrapping the JSON image refs embedded in the tool result text. */
export const IMAGE_REFS_OPEN = "<vetta-images>";
export const IMAGE_REFS_CLOSE = "</vetta-images>";

/** Wrap produced refs in the machine-readable marker the host parses (or "" when none). */
function imageRefsMarker(images: ImageToolRef[]): string {
	return images.length > 0 ? `\n${IMAGE_REFS_OPEN}${JSON.stringify(images)}${IMAGE_REFS_CLOSE}` : "";
}

const sizeSchema = Type.Optional(
	Type.String({
		description:
			"Output image dimensions as 'WIDTHxHEIGHT' (e.g. '1024x1024', '1024x1536', '1536x1024', or any other ratio/resolution the user wants). Choose to match the desired aspect ratio. Defaults to '1024x1024' if omitted.",
	}),
);

const generateImageSchema = Type.Object({
	prompt: Type.String({
		description:
			"A detailed, vivid English prompt describing the image to generate. Optimize the user's request into a concrete prompt (subject, style, lighting, composition).",
	}),
	size: sizeSchema,
});

const editImageSchema = Type.Object({
	prompt: Type.String({
		description:
			"A clear English instruction describing the modification to apply to the source image (e.g. 'replace the background with a night city skyline, keep the subject unchanged'). Describe only the change, the source image is supplied separately.",
	}),
	sourceImageId: Type.String({
		description:
			"The id of the existing image to edit. Use the id from the most recent " +
			`${IMAGE_REFS_OPEN}...${IMAGE_REFS_CLOSE} marker in the conversation, ` +
			"or the id the user explicitly selected for editing.",
	}),
	size: sizeSchema,
});

/**
 * Build the `generate_image` tool bound to a concrete host image backend.
 * Injected per-session via CreateAgentSessionOptions.customTools when the host
 * supplies an image backend. Returns only a lightweight reference: the image
 * bytes are stored out-of-band and never enter the LLM context.
 */
export function createGenerateImageTool(
	backend: ImageToolBackend,
): ToolDefinition<typeof generateImageSchema, GenerateImageToolDetails> {
	return {
		name: "generate_image",
		label: "Generate Image",
		description:
			"Generate an image from a text prompt (text-to-image). Use when the user wants a brand-new image. " +
			"Optimize the user's request into a detailed prompt, then call this tool. The generated image is shown " +
			"to the user automatically; you only receive a short confirmation, not the image bytes.",
		parameters: generateImageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const sessionId = ctx.sessionManager.getSessionId();
			const images = await backend.generate({ prompt: params.prompt, size: params.size, sessionId });
			// The host (desktop) drops tool `details` before the result reaches the
			// renderer, so the image references (id + vetta-media URL + rootId) ride
			// in the result text inside a machine-readable marker. The renderer parses
			// it to bind imageRefs onto the message for the preview slot.
			return {
				content: [
					{
						type: "text" as const,
						text:
							images.length > 0
								? `已生成 ${images.length} 张图像并展示给用户。${imageRefsMarker(images)}`
								: "图像生成未返回结果。",
					},
				],
				details: { images },
			};
		},
	};
}

/**
 * Build the `edit_image` tool (image-to-image) bound to a concrete host image
 * backend. Edits an existing host image by id, appending a new version to that
 * image's edit lineage (the source image is preserved). Like generate_image,
 * the bytes stay out-of-band — only a lightweight reference is returned.
 */
export function createEditImageTool(
	backend: ImageToolBackend,
): ToolDefinition<typeof editImageSchema, GenerateImageToolDetails> {
	return {
		name: "edit_image",
		label: "Edit Image",
		description:
			"Edit an existing image (image-to-image). Use when the user wants to modify a previously generated " +
			"image rather than create a new one — pass the source image's id in `sourceImageId` and describe the " +
			"change in `prompt`. The result is appended as a new version of that image's lineage and shown to the " +
			"user automatically; you only receive a short confirmation, not the image bytes.",
		parameters: editImageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const sessionId = ctx.sessionManager.getSessionId();
			const images = await backend.edit({
				prompt: params.prompt,
				sourceImageId: params.sourceImageId,
				size: params.size,
				sessionId,
			});
			return {
				content: [
					{
						type: "text" as const,
						text:
							images.length > 0
								? `已基于源图像生成 ${images.length} 张编辑结果并展示给用户。${imageRefsMarker(images)}`
								: "图像编辑未返回结果。",
					},
				],
				details: { images },
			};
		},
	};
}
