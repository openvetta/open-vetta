import { join } from "node:path";
import type { KbFilterByTagsOperations, KbListTagsOperations } from "@vetta/runtime-tools/coding";
import { getKnowledgeDir } from "../../config.js";
import { listAvailableTags, queryByTags } from "../../core/knowledge/query.js";

export type CodingAgentKnowledgeQueryOperations = KbListTagsOperations & KbFilterByTagsOperations;

/** Knowledge 文件格式仍由产品能力持有；Runtime Tool 只消费这个查询 Port。 */
export function createCodingAgentKnowledgeQueryOperations(root?: string): CodingAgentKnowledgeQueryOperations {
	const resolvedRoot = root ?? getKnowledgeDir();
	return {
		listAvailableTags: () => listAvailableTags(resolvedRoot),
		queryByTags: async (input) => {
			const pages = await queryByTags(resolvedRoot, input);
			return pages.map((page) => ({ ...page, absolutePath: join(resolvedRoot, "wiki", page.path) }));
		},
	};
}
