import type { UserMessage } from "@vetta/ai";
import type { ContinuationPolicyContext } from "@vetta/runtime-core/kernel";
import { getLastAssistantText } from "../../core/session/session-stats.js";
import type { CodingAgentContinuationSource } from "./greenfield-continuation-orchestrator.js";

export type CodingAgentStopHookInvoker = (
	lastAssistantMessage: string | null,
	signal: AbortSignal,
) => Promise<readonly string[]>;

export interface CodingAgentStopHookContinuationSourceOptions {
	readonly invoke: CodingAgentStopHookInvoker;
	readonly now?: () => number;
}

/** 把既有 Ecosystem Stop Hook 的文本片段适配为普通 continuation UserMessage。 */
export class CodingAgentStopHookContinuationSource implements CodingAgentContinuationSource {
	private readonly now: () => number;

	constructor(private readonly options: CodingAgentStopHookContinuationSourceOptions) {
		this.now = options.now ?? Date.now;
	}

	async collect(context: ContinuationPolicyContext): Promise<readonly UserMessage[]> {
		if (context.signal.aborted) return [];
		const fragments = await this.options.invoke(getLastAssistantText([...context.messages]) ?? null, context.signal);
		return fragments.map((text) => ({
			role: "user",
			content: [{ type: "text", text }],
			timestamp: this.now(),
		}));
	}
}
