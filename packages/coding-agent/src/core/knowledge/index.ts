/**
 * LLM Wiki 知识库核心模块。
 * 见 docs/prd-knowledge-base-llm-wiki.md。
 */

export {
	rebuildManifest,
	rebuildTagsIndex,
	type WikiPageRef,
} from "./cache.js";
export {
	type AddedChange,
	type ChangedChange,
	type DeletedChange,
	diffRaws,
	isEmptyDiff,
	type MovedChange,
	type OrphanPlan,
	planOrphans,
	type RawsDiff,
} from "./differ.js";
export {
	type ParsedWikiPage,
	parseWikiPage,
	serializeWikiPage,
	validateWikiFrontmatter,
	WikiFrontmatterError,
} from "./frontmatter.js";
export {
	finalizeRound,
	type PreparedRound,
	prepareRound,
	rebuildAllCaches,
} from "./ingest.js";
export { buildProcessingPrompt, KB_PROCESSING_GUIDE } from "./processing-prompt.js";
export { type FilteredPage, queryByTags } from "./query.js";
export {
	deleteWikiPage,
	ensureKnowledgeDirs,
	generatePageId,
	hashContent,
	indexesDir,
	knowledgeRoot,
	manifestPath,
	processingRecordsCwd,
	rawsDir,
	rawsExists,
	readManifest,
	readTagsIndex,
	type ScannedWikiPage,
	scanRaws,
	scanWikiPages,
	tagsPath,
	type WikiScanResult,
	wikiDir,
	writeManifest,
	writeTagsIndex,
	writeWikiPage,
} from "./store.js";
export { filterByTags, type TaggedPage, type TagQuery } from "./tag-filter.js";
export * from "./types.js";
export {
	resolveUpsert,
	type UpsertDecision,
	type UpsertInput,
	type UpsertLookup,
} from "./upsert.js";
export {
	type WritePageRequest,
	type WritePageResult,
	writeKnowledgePage,
} from "./writer.js";
