/**
 * A reference to an image produced out-of-band by the host (e.g. an image
 * tool's result). The bytes are NOT carried inline — `url` is a host media
 * URL (Range-capable, usable directly as an `<img src>`).
 */
export interface PluginImageRef {
	id: string;
	url: string;
	mimeType?: string;
	/**
	 * The edit-lineage root id this image belongs to (base image + all its edits
	 * share one rootId). Lets the host dedup per-message previews — only the
	 * latest message producing a given rootId renders the version swiper.
	 */
	rootId?: string;
}

export interface PluginGenerateImageInput {
	prompt: string;
	/** Output size (e.g. "1024x1024"), decided by the agent and forwarded to the model. */
	size?: string;
	/** Optional reference id for grouping (e.g. the conversation/session). */
	sessionId?: string;
}

export interface PluginEditImageInput {
	prompt: string;
	/**
	 * Source image to edit. Either an existing host image id (continue a
	 * lineage) or raw base64 bytes (e.g. a user upload).
	 */
	source: { imageId: string } | { data: string; mimeType: string };
	sessionId?: string;
}

/**
 * Image generation, routed to the host's main-process image service (single
 * implementation shared with the agent's built-in image tool). Bytes are
 * stored out-of-band; results are returned as host media references.
 */
export interface PluginImagesApi {
	/** Text-to-image. Resolves to the produced image reference(s). */
	generate(input: PluginGenerateImageInput): Promise<PluginImageRef[]>;
	/** Image-to-image edit, producing the next version in a lineage. */
	edit(input: PluginEditImageInput): Promise<PluginImageRef[]>;
	/** The edit lineage (base image + its edits, oldest first) for an image. */
	lineage(imageId: string): Promise<PluginImageRef[]>;
	/**
	 * Every edit lineage the given session touched (generated or edited a version
	 * in), newest lineage first; each lineage's versions oldest → newest. The
	 * sessionId is the agent session id — derive it from the active conversation's
	 * `sessionPath` (the UUID embedded in the session file name).
	 */
	sessionLineages(sessionId: string): Promise<PluginImageRef[][]>;
}
