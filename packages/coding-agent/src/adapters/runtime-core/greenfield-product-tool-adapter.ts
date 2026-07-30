import { createDocToPdfTool } from "../../core/tools/doc-to-pdf/index.js";
import { createExtractTextFromImgTool } from "../../core/tools/extract-text-from-img/index.js";
import { createExtractTextFromPdfTool } from "../../core/tools/extract-text-from-pdf/index.js";
import { createHtmlToPdfTool } from "../../core/tools/html-to-pdf/index.js";
import { createKbWritePageTool } from "../../core/tools/kb-write-page/index.js";
import { createProgressTool } from "../../core/tools/progress/index.js";
import { createRenderPdfPageTool } from "../../core/tools/render-pdf-page/index.js";
import {
	adaptCodingAgentToolRegistration,
	type CodingAgentRuntimeToolRegistration,
} from "./greenfield-tool-adapter.js";

export interface CodingAgentGreenfieldProductToolOptions {
	readonly cwd: string;
	readonly knowledgeRoot?: string;
}

/**
 * Greenfield 尚未原生化的产品工具兼容边界。
 *
 * 这里仅把既有工具定义适配为 Runtime 注册项，不复制执行逻辑，也不改变工具协议；
 * 后续可逐个把实现下沉到 runtime-tools，而 Composition Root 无需再次改变。
 */
export function createCodingAgentGreenfieldProductToolRegistrations(
	options: CodingAgentGreenfieldProductToolOptions,
): readonly CodingAgentRuntimeToolRegistration[] {
	return [
		adaptCodingAgentToolRegistration(createDocToPdfTool(options.cwd)),
		adaptCodingAgentToolRegistration(createHtmlToPdfTool(options.cwd)),
		adaptCodingAgentToolRegistration(createExtractTextFromPdfTool(options.cwd)),
		adaptCodingAgentToolRegistration(createExtractTextFromImgTool(options.cwd)),
		adaptCodingAgentToolRegistration(createRenderPdfPageTool(options.cwd)),
		adaptCodingAgentToolRegistration(createProgressTool()),
		adaptCodingAgentToolRegistration(createKbWritePageTool(options.knowledgeRoot)),
	];
}
