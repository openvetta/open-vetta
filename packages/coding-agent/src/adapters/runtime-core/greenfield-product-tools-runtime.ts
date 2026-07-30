import type { AgentFeatureDefinition, ModelCallContributionContext } from "@vetta/runtime-core/kernel";
import {
	type CodingToolActivation,
	createDocToPdfToolRegistration,
	createExtractTextFromImageToolRegistration,
	createExtractTextFromPdfToolRegistration,
	createHtmlToPdfToolRegistration,
	createProgressToolRegistration,
	createRenderPdfPageToolRegistration,
	RenderPdfPageProcessAbortedError,
	selectCodingToolRegistrations,
} from "@vetta/runtime-tools/coding";
import { createLocalDocToPdfOperations } from "../../core/tools/doc-to-pdf/index.js";
import { runSubprocess, SubprocessAbortError } from "../../core/tools/exec-subprocess.js";
import { runWithOcrLimit } from "../../core/tools/ocr-concurrency.js";
import { createCodingAgentDesktopCommandHost } from "./greenfield-desktop-command-host.js";
import {
	createCodingAgentKnowledgePageWriter,
	createCodingAgentKnowledgeWriteRegistration,
} from "./greenfield-knowledge-write-runtime.js";
import { CODING_AGENT_MODEL_TOOL_ORDER } from "./greenfield-model-tool-order.js";
import type { CodingAgentRuntimeToolRegistration } from "./greenfield-tool-adapter.js";

export interface CodingAgentGreenfieldProductToolOptions {
	readonly cwd: string;
	readonly knowledgeRoot?: string;
}

export interface CodingAgentGreenfieldProductToolFeatureOptions {
	readonly registrations: readonly CodingAgentRuntimeToolRegistration[];
	readonly resolveActivation: (
		context: ModelCallContributionContext,
	) => Promise<CodingToolActivation> | CodingToolActivation;
}

/** 组装产品级 Runtime 工具及其宿主端口；工具执行合同由 runtime-tools 提供。 */
export function createCodingAgentGreenfieldProductToolRegistrations(
	options: CodingAgentGreenfieldProductToolOptions,
): readonly CodingAgentRuntimeToolRegistration[] {
	const desktop = createCodingAgentDesktopCommandHost();
	const ocrExecutionGate = { run: runWithOcrLimit };
	return [
		createDocToPdfToolRegistration(options.cwd, {
			operations: createLocalDocToPdfOperations(),
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.docToPdf,
		}),
		createHtmlToPdfToolRegistration(options.cwd, {
			desktop,
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.htmlToPdf,
		}),
		createExtractTextFromPdfToolRegistration(options.cwd, {
			desktop,
			process: desktop,
			executionGate: ocrExecutionGate,
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.extractTextFromPdf,
		}),
		createExtractTextFromImageToolRegistration(options.cwd, {
			desktop,
			executionGate: ocrExecutionGate,
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.extractTextFromImage,
		}),
		createRenderPdfPageToolRegistration(options.cwd, {
			process: {
				async run(args, signal) {
					try {
						return await runSubprocess("pdftoppm", [...args], {
							signal,
							timeout: 5 * 60 * 1_000,
							maxBuffer: 4 * 1_024 * 1_024,
						});
					} catch (error) {
						if (error instanceof SubprocessAbortError) throw new RenderPdfPageProcessAbortedError();
						throw error;
					}
				},
			},
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.renderPdfPage,
		}),
		createProgressToolRegistration({
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.progress,
		}),
		createCodingAgentKnowledgeWriteRegistration({
			writer: createCodingAgentKnowledgePageWriter(options.knowledgeRoot),
			modelOrder: CODING_AGENT_MODEL_TOOL_ORDER.knowledgeWrite,
		}),
	];
}

/** 产品工具按 Session 创建，避免把 Composition Root cwd 固化到其他会话。 */
export function createCodingAgentGreenfieldProductToolFeature(
	options: CodingAgentGreenfieldProductToolFeatureOptions,
): AgentFeatureDefinition {
	return {
		id: "coding-agent.product-tools",
		async prepare(context) {
			context.signal.throwIfAborted();
			return {
				async contribute() {
					return {
						modelCallProviders: [
							{
								id: "coding-agent.product-tools",
								async contribute(callContext) {
									callContext.signal.throwIfAborted();
									const activation = await options.resolveActivation(callContext);
									return {
										tools: selectCodingToolRegistrations(options.registrations, activation).map(
											({ tool }) => tool,
										),
									};
								},
							},
						],
					};
				},
				async dispose() {},
			};
		},
	};
}
