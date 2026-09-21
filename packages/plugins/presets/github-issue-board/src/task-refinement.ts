import type { PluginAiApi, PluginAiStreamOptions } from "@vetta-org/plugin-sdk";

export const TASK_REFINEMENT_SYSTEM_PROMPT = `You expand a rough task draft into a Markdown brief for an AI coding agent.

Return only Markdown. Do not wrap the result in a fence. Do not add commentary before or after it.

Use these three sections, in this order, with headings in the same language as the user's draft:
1. Background / Goal (Chinese drafts: 背景/目标) — why the work exists and what done looks like
2. Acceptance criteria (Chinese drafts: 验收标准) — concrete, checkable conditions
3. Implementation notes (Chinese drafts: 实现建议) — optional; omit this entire section if you are not confident

Keep the same language as the user's draft. Do not switch languages.
Do not invent labels, priority, assignees, or other GitHub metadata.
Do not invent requirements that are absent from the draft.`;

export interface RefineTaskDraftOptions {
	onTextDelta?(text: string): void;
	signal?: AbortSignal;
	/** Current conversation model (`provider/id`). Omitted → host default / fallback. */
	modelKey?: string;
}

export class TaskRefinementService {
	constructor(private readonly ai: PluginAiApi) {}

	async refine(source: string, options?: RefineTaskDraftOptions): Promise<string> {
		const prompt = source.trim();
		if (!prompt) throw new Error("task draft is empty");

		const streamOptions: PluginAiStreamOptions = {
			onTextDelta: (event) => options?.onTextDelta?.(event.text),
		};
		if (options?.signal) streamOptions.signal = options.signal;
		const modelKey = options?.modelKey?.trim();

		const result = await this.ai.stream(
			{
				...(modelKey ? { modelKey } : {}),
				systemPrompt: TASK_REFINEMENT_SYSTEM_PROMPT,
				prompt,
				temperature: 0.3,
			},
			streamOptions,
		);
		const text = result.text.trim();
		if (!text) throw new Error("task refinement returned empty content");
		return text;
	}
}
