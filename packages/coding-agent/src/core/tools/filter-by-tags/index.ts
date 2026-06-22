import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import { queryByTags } from "../../knowledge/query.js";
import { knowledgeRoot, wikiDir } from "../../knowledge/store.js";
import { loadToolDescription } from "../description.js";

const filterByTagsSchema = Type.Object({
	all: Type.Optional(
		Type.Array(Type.String(), {
			description: "Intersection: page must contain ALL of these tags.",
		}),
	),
	any: Type.Optional(
		Type.Array(Type.String(), {
			description: "Union: page must contain AT LEAST ONE of these tags.",
		}),
	),
	none: Type.Optional(
		Type.Array(Type.String(), {
			description: "Complement: page must contain NONE of these tags.",
		}),
	),
});

export type FilterByTagsInput = Static<typeof filterByTagsSchema>;

export interface FilterByTagsDetails {
	count: number;
	pages: Array<{ id: string; path: string; absolutePath: string; title: string; summary: string; tags: string[] }>;
}

/**
 * 按标签交/并/补过滤知识库 wiki 页。检索捷径，非必经路（也可走 indexes 或渐进探索）。
 * @param root 知识库根目录，默认 ~/.vetta/knowledges。
 */
export function createFilterByTagsTool(root?: string): AgentTool<typeof filterByTagsSchema> {
	const fallbackDescription =
		"Filter knowledge base wiki pages by tags using set algebra (all=AND, any=OR, none=NOT). " +
		"A retrieval shortcut, not the only path — you can also navigate via indexes/ or progressively explore the wiki tree.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "filter_by_tags",
		label: "Filter by Tags",
		description,
		parameters: filterByTagsSchema,
		execute: async (_toolCallId, params) => {
			const resolvedRoot = knowledgeRoot(root);
			const base = wikiDir(resolvedRoot);
			const pages = await queryByTags(resolvedRoot, params);
			const enriched = pages.map((p) => ({ ...p, absolutePath: join(base, p.path) }));
			const details: FilterByTagsDetails = { count: enriched.length, pages: enriched };
			const listing =
				enriched.length === 0
					? "(no matches)"
					: enriched.map((p) => `- [${p.id}] ${p.absolutePath} — ${p.title}: ${p.summary}`).join("\n");
			return {
				content: [{ type: "text", text: `filter_by_tags matched ${enriched.length} page(s):\n${listing}` }],
				details,
			};
		},
	};
}

export const filterByTagsTool = createFilterByTagsTool();
