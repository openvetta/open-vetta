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
	/**
	 * Image-to-image. The source is either an existing host image (`sourceImageId`,
	 * for an image Vetta previously generated) or a local image file on disk
	 * (`sourceImagePath`, e.g. an image the user uploaded/attached). Exactly one is
	 * provided. The result is appended as a new lineage version.
	 */
	edit(input: {
		prompt: string;
		sourceImageId?: string;
		sourceImagePath?: string;
		size?: string;
		sessionId?: string;
	}): Promise<ImageToolRef[]>;
}

/**
 * A message-card descriptor carried out-of-band on the tool result's `details`
 * (model-invisible). The desktop host resolves `type` to a plugin card renderer
 * (here, the image-gen plugin's preview). `key` = lineage rootId so the host
 * shows a lineage only under its latest-producing turn (cross-turn dedup).
 */
interface ImagePreviewCardDescriptor {
	type: string;
	key?: string;
	payload: { images: ImageToolRef[] };
}

export interface GenerateImageToolDetails {
	images: ImageToolRef[];
	/** Preview card descriptor(s) for the desktop card host. */
	cards: ImagePreviewCardDescriptor[];
}

/** Card type — must match the image-gen plugin's registerCardRenderer type. */
const PREVIEW_CARD_TYPE = "image-gen:preview";

/** Build the preview card descriptor for produced refs (empty when none). */
function previewCards(images: ImageToolRef[]): ImagePreviewCardDescriptor[] {
	if (images.length === 0) return [];
	return [{ type: PREVIEW_CARD_TYPE, key: images[0]!.rootId, payload: { images } }];
}

/** Markers wrapping the JSON image refs embedded in the tool result text. */
export const IMAGE_REFS_OPEN = "<vetta-images>";
export const IMAGE_REFS_CLOSE = "</vetta-images>";

/**
 * Wrap produced refs in the machine-readable marker (or "" when none). This
 * stays in the model-visible result text purely so the MODEL can reference an
 * image id when the user asks to edit "the last image" without an explicit
 * attachment — it is NOT the card data source (cards ride `details.cards`).
 */
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
	sourceImageId: Type.Optional(
		Type.String({
			description:
				"The id of an image Vetta previously generated, to edit. Use the id from the most recent " +
				`${IMAGE_REFS_OPEN}...${IMAGE_REFS_CLOSE} marker in the conversation, ` +
				"or the id the user explicitly selected for editing. Omit when editing a local image file (use sourceImagePath instead).",
		}),
	),
	sourceImagePath: Type.Optional(
		Type.String({
			description:
				"Absolute path to a local image file to edit — e.g. an image the user uploaded/attached, " +
				"referenced in the conversation by @path. Use this for any image that is a file on disk rather " +
				"than a previously generated image. Provide exactly one of sourceImageId or sourceImagePath.",
		}),
	),
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
		scope_use: ["im-claw", "conversation", "project", "cli"],
		category: "media",
		description:
			"Generate an image from a text prompt (text-to-image). Use when the user wants a brand-new image. " +
			"Optimize the user's request into a detailed prompt, then call this tool. The generated image is shown " +
			"to the user automatically; you only receive a short confirmation, not the image bytes.",
		parameters: generateImageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const sessionId = ctx.sessionManager.getSessionId();
			const images = await backend.generate({ prompt: params.prompt, size: params.size, sessionId });
			// Image refs ride out-of-band on `details.cards` (model-invisible) — the
			// desktop card host renders them via the image-gen plugin. The text marker
			// stays only as the model's id-reference channel (see imageRefsMarker).
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
				details: { images, cards: previewCards(images) },
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
		scope_use: ["im-claw", "conversation", "project", "cli"],
		category: "media",
		description:
			"Edit an existing image (image-to-image) rather than create a new one. The source can be either an " +
			"image Vetta previously generated (pass its id in `sourceImageId`) or any local image file on disk — " +
			"e.g. an image the user uploaded/attached, referenced by @path — (pass its absolute path in " +
			"`sourceImagePath`). Provide exactly one of the two and describe the change in `prompt`. Prefer this " +
			"over generate_image whenever the user wants to modify a specific existing image: it preserves the " +
			"original content instead of redrawing from scratch. The result is shown to the user automatically; " +
			"you only receive a short confirmation, not the image bytes.",
		parameters: editImageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			if (!params.sourceImageId && !params.sourceImagePath) {
				return {
					content: [
						{
							type: "text" as const,
							text: "edit_image 需要提供 sourceImageId（Vetta 已生成的图像）或 sourceImagePath（本地图片文件的绝对路径）其中之一。",
						},
					],
					details: { images: [], cards: [] },
				};
			}
			const sessionId = ctx.sessionManager.getSessionId();
			const images = await backend.edit({
				prompt: params.prompt,
				sourceImageId: params.sourceImageId,
				sourceImagePath: params.sourceImagePath,
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
				details: { images, cards: previewCards(images) },
			};
		},
	};
}
