import { join } from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import type { RuntimeToolDefinition } from "@vetta/runtime-core/kernel";
import { knowledgeRoot, wikiDir } from "../../core/knowledge/store.js";
import { type WritePageRequest, type WritePageResult, writeKnowledgePage } from "../../core/knowledge/writer.js";
import type { CodingAgentRuntimeToolRegistration } from "./greenfield-tool-adapter.js";

export const KNOWLEDGE_WRITE_TOOL_DESCRIPTION = `Write (create or update) a single wiki page in the LLM knowledge base at ~/.vetta/knowledges/.

This is the ONLY way to write wiki pages. It enforces the closed frontmatter schema (exactly: id, source, source_path, source_hash, tags, title, summary, created_at, updated_at, orphaned_at), assigns a stable page id, and refreshes the tags.json / manifest.json caches automatically. Do not hand-write wiki .md files with the generic write tool.

Upsert semantics:
- Provide \`id\` to update an existing page in place. The page keeps its id and created_at; updated_at is refreshed. Use this when reprocessing a changed source file (the poller resolves the old id for you).
- Omit \`id\`: if a page with the same \`source_hash\` already exists it is updated; otherwise a new page is created with a freshly assigned id.

Tree placement: \`path\` is relative to wiki/ and you choose it by topic/semantics (e.g. "产品/计费.md"), not by mirroring the raws layout. Updating an existing page with a different \`path\` moves it within the wiki tree (old file removed).

Cross-page references: put them in the body as [[page-id]] — never in frontmatter.

raw↔wiki is 1:1. One source raw file maps to exactly one wiki page.`;

export const KnowledgeWriteToolInputSchema = Type.Object({
	description: Type.Optional(
		Type.String({
			description: "Brief user-facing reason for this tool call (max 100 chars).",
			maxLength: 100,
		}),
	),
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
		maxItems: 5,
		description:
			"Flat string tags, at most 5. Reuse existing tags from kb_list_available_tags when semantically close; " +
			"Chinese for concepts/domains/topics, keep only proper nouns/tech stack in their original form (kubernetes, oauth). " +
			"Coarse, reusable dimensions only (domain/topic/doc-type); no version numbers, function names, one-off proper nouns, " +
			"or info already in title/summary.",
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

export type KnowledgeWriteToolInput = Static<typeof KnowledgeWriteToolInputSchema>;

export interface KnowledgeWriteToolDetails {
	readonly action: "create" | "update";
	readonly id: string;
	readonly path: string;
	readonly absolutePath: string;
	readonly movedFrom?: string;
}

export interface KnowledgePageWriterPort {
	write(request: WritePageRequest, now: string): Promise<WritePageResult>;
	resolveAbsolutePath(relativeWikiPath: string): string;
}

export function createCodingAgentKnowledgePageWriter(root?: string): KnowledgePageWriterPort {
	const resolvedRoot = knowledgeRoot(root);
	return {
		write: (request, now) => writeKnowledgePage(resolvedRoot, request, now),
		resolveAbsolutePath: (relativeWikiPath) => join(wikiDir(resolvedRoot), relativeWikiPath),
	};
}

export function createCodingAgentKnowledgeWriteTool(options: {
	readonly writer: KnowledgePageWriterPort;
	readonly now?: () => Date;
	readonly modelOrder?: number;
}): RuntimeToolDefinition<KnowledgeWriteToolInput> {
	const now = options.now ?? (() => new Date());
	return {
		name: "kb_write_page",
		label: "KB Write Page",
		description: KNOWLEDGE_WRITE_TOOL_DESCRIPTION,
		inputSchema: KnowledgeWriteToolInputSchema,
		modelOrder: options.modelOrder,
		async execute({ input }) {
			const result = await options.writer.write(input, now().toISOString());
			const absolutePath = options.writer.resolveAbsolutePath(result.path);
			const details: KnowledgeWriteToolDetails = {
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

export function createCodingAgentKnowledgeWriteRegistration(options: {
	readonly writer: KnowledgePageWriterPort;
	readonly now?: () => Date;
	readonly modelOrder?: number;
}): CodingAgentRuntimeToolRegistration {
	return {
		tool: createCodingAgentKnowledgeWriteTool(options),
		scopeUse: ["kb-processing"],
		requires: ["knowledge"],
		modelOrder: options.modelOrder,
		category: "kb-write",
	};
}
