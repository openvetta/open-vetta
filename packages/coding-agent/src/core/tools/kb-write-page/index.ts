import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { AgentTool } from "@vetta/agent-core";
import { knowledgeRoot, wikiDir } from "../../knowledge/store.js";
import { writeKnowledgePage } from "../../knowledge/writer.js";
import { loadToolDescription } from "../description.js";

const kbWritePageSchema = Type.Object({
	path: Type.String({
		description:
			'Target wiki page path relative to wiki/, e.g. "产品/计费.md". Organize the tree by topic/semantics, not by raw source layout. Updating an existing page with a new path moves it.',
	}),
	source: Type.String({
		description: "Source grouping name (the raws/<source>/ folder this page derives from).",
	}),
	source_path: Type.String({
		description: 'Original raw file path relative to raws/, e.g. "手册/api.md".',
	}),
	source_hash: Type.String({
		description: "Content hash of the source raw file (the page's primary identity).",
	}),
	tags: Type.Array(Type.String(), {
		description: "Flat string tags for this page.",
	}),
	title: Type.String({ description: "Page title." }),
	summary: Type.String({ description: "One-line summary, surfaced in indexes navigation." }),
	body: Type.String({
		description: "Page body markdown (without frontmatter). Cross-page links go here as [[page-id]].",
	}),
	id: Type.Optional(
		Type.String({
			description:
				"Existing page id to update in place (preserves id + created_at). Provide this when reprocessing a changed source; the poller resolves it. Omit to create a new page.",
		}),
	),
});

export type KbWritePageInput = Static<typeof kbWritePageSchema>;

export interface KbWritePageDetails {
	action: "create" | "update";
	id: string;
	/** wiki 页相对 wiki/ 的路径。 */
	path: string;
	/** wiki 页的绝对路径，可直接交给 read 工具。 */
	absolutePath: string;
	movedFrom?: string;
}

/**
 * 知识库唯一写页入口。守封闭 frontmatter schema、分配稳定 id、按 source_hash/id
 * upsert，并刷新 tags.json / manifest.json 缓存。
 * @param root 知识库根目录，默认 ~/.vetta/knowledges。
 */
export function createKbWritePageTool(root?: string): AgentTool<typeof kbWritePageSchema> {
	const fallbackDescription =
		"Write (create or update) a wiki page in the knowledge base. Enforces the closed frontmatter schema, " +
		"assigns a stable id, upserts by id or source_hash, and refreshes the tags/manifest caches.";
	const description = loadToolDescription(import.meta.url, fallbackDescription);

	return {
		name: "kb_write_page",
		label: "KB Write Page",
		description,
		parameters: kbWritePageSchema,
		execute: async (_toolCallId, params) => {
			const resolvedRoot = knowledgeRoot(root);
			const now = new Date().toISOString();
			const result = await writeKnowledgePage(resolvedRoot, params, now);
			const absolutePath = join(wikiDir(resolvedRoot), result.path);
			const details: KbWritePageDetails = {
				action: result.action,
				id: result.id,
				path: result.path,
				absolutePath,
				movedFrom: result.movedFrom,
			};
			const moved = result.movedFrom ? ` (moved from ${result.movedFrom})` : "";
			return {
				content: [
					{
						type: "text",
						text: `kb_write_page ${result.action} ok — id=${result.id}, path=${absolutePath}${moved}`,
					},
				],
				details,
			};
		},
	};
}

export const kbWritePageTool = createKbWritePageTool();
