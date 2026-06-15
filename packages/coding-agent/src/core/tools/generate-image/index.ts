import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "../../extensions/types.js";

/** A reference to an image produced by the host image backend (bytes stored out-of-band). */
export interface ImageToolRef {
	id: string;
	url: string;
	mimeType: string;
}

/**
 * Host-provided image backend. The agent's generate_image tool is a thin
 * wrapper over this; the host (desktop) implements it against its main-process
 * image service. coding-agent never depends on the host implementation.
 */
export interface ImageToolBackend {
	generate(input: { prompt: string; sessionId?: string }): Promise<ImageToolRef[]>;
}

export interface GenerateImageToolDetails {
	images: ImageToolRef[];
}

/** Markers wrapping the JSON image refs embedded in the tool result text. */
export const IMAGE_REFS_OPEN = "<vetta-images>";
export const IMAGE_REFS_CLOSE = "</vetta-images>";

const generateImageSchema = Type.Object({
	prompt: Type.String({
		description:
			"A detailed, vivid English prompt describing the image to generate. Optimize the user's request into a concrete prompt (subject, style, lighting, composition).",
	}),
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
			"Generate an image from a text prompt. Use when the user wants to create an image (text-to-image). " +
			"Optimize the user's request into a detailed prompt, then call this tool. The generated image is shown " +
			"to the user automatically; you only receive a short confirmation, not the image bytes.",
		parameters: generateImageSchema,
		execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
			const sessionId = ctx.sessionManager.getSessionId();
			const images = await backend.generate({ prompt: params.prompt, sessionId });
			// The host (desktop) drops tool `details` before the result reaches the
			// renderer, so the image references (id + vetta-media URL) ride in the
			// result text inside a machine-readable marker. The renderer parses it
			// to bind imageRefs onto the message for the preview slot.
			const marker = images.length > 0 ? `\n${IMAGE_REFS_OPEN}${JSON.stringify(images)}${IMAGE_REFS_CLOSE}` : "";
			return {
				content: [
					{
						type: "text" as const,
						text:
							images.length > 0
								? `已生成 ${images.length} 张图像并展示给用户。${marker}`
								: "图像生成未返回结果。",
					},
				],
				details: { images },
			};
		},
	};
}
