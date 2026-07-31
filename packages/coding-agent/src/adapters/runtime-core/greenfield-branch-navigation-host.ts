import type { GreenfieldRuntimeSession } from "@vetta/runtime-core";
import { collectEntriesForBranchSummary, generateBranchSummary } from "../../core/compaction/index.js";
import type {
	ExtensionCommandContextActions,
	ExtensionRunner,
	SessionBeforeTreeResult,
	TreePreparation,
} from "../../core/extensions/index.js";
import type { BranchSummaryEntry } from "../../core/session-manager/index.js";
import type { SettingsManager } from "../../core/settings-manager.js";
import { createGreenfieldReadonlySessionManager } from "./greenfield-readonly-session-manager.js";

export interface CodingAgentGreenfieldBranchNavigationHostOptions {
	readonly withActiveSession: <T>(operation: (session: GreenfieldRuntimeSession) => Promise<T>) => Promise<T>;
	readonly readRunner: () => ExtensionRunner;
	readonly settingsManager: Pick<SettingsManager, "getBranchSummarySettings">;
	readonly generateSummary?: typeof generateBranchSummary;
}

/**
 * 保留 Legacy /tree 的摘要、Extension 事件与标签语义，同时只通过 Runtime Core
 * 历史写端口更新 ConversationDocument。
 */
export class CodingAgentGreenfieldBranchNavigationHost {
	private readonly generateSummary: typeof generateBranchSummary;

	constructor(private readonly options: CodingAgentGreenfieldBranchNavigationHostOptions) {
		this.generateSummary = options.generateSummary ?? generateBranchSummary;
	}

	navigateTree(
		targetId: string,
		options: Parameters<ExtensionCommandContextActions["navigateTree"]>[1] = {},
	): Promise<{ cancelled: boolean }> {
		return this.options.withActiveSession((session) => this.navigate(session, targetId, options));
	}

	private async navigate(
		session: GreenfieldRuntimeSession,
		targetId: string,
		options: NonNullable<Parameters<ExtensionCommandContextActions["navigateTree"]>[1]>,
	): Promise<{ cancelled: boolean }> {
		const assembly = session.createCoreAssembly();
		const sessionManager = createGreenfieldReadonlySessionManager(assembly);
		const oldLeafId = sessionManager.getLeafId();
		if (targetId === oldLeafId) return { cancelled: false };

		const model = assembly.modelView.readCurrentModel();
		if (options.summarize && !model) throw new Error("No model available for summarization");
		const targetEntry = sessionManager.getEntry(targetId);
		if (!targetEntry) throw new Error(`Entry ${targetId} not found`);

		const { entries: entriesToSummarize, commonAncestorId } = collectEntriesForBranchSummary(
			sessionManager,
			oldLeafId,
			targetId,
		);
		let customInstructions = options.customInstructions;
		let replaceInstructions = options.replaceInstructions;
		let label = options.label;
		const preparation: TreePreparation = {
			targetId,
			oldLeafId,
			commonAncestorId,
			entriesToSummarize,
			userWantsSummary: options.summarize ?? false,
			customInstructions,
			replaceInstructions,
			label,
		};
		const abortController = new AbortController();
		const runner = this.options.readRunner();

		try {
			let extensionSummary: { summary: string; details?: unknown } | undefined;
			let fromExtension = false;
			if (runner.hasHandlers("session_before_tree")) {
				const result = (await runner.emit({
					type: "session_before_tree",
					preparation,
					signal: abortController.signal,
				})) as SessionBeforeTreeResult | undefined;
				if (result?.cancel) return { cancelled: true };
				if (result?.summary && options.summarize) {
					extensionSummary = result.summary;
					fromExtension = true;
				}
				if (result?.customInstructions !== undefined) customInstructions = result.customInstructions;
				if (result?.replaceInstructions !== undefined) replaceInstructions = result.replaceInstructions;
				if (result?.label !== undefined) label = result.label;
			}

			let summaryText: string | undefined;
			let summaryDetails: unknown;
			if (options.summarize && entriesToSummarize.length > 0 && !extensionSummary) {
				const apiKey = await assembly.modelView.resolveApiKey(model!);
				if (!apiKey) throw new Error(`No API key for ${model!.provider}`);
				const result = await this.generateSummary(entriesToSummarize, {
					model: model!,
					apiKey,
					signal: abortController.signal,
					customInstructions,
					replaceInstructions,
					reserveTokens: this.options.settingsManager.getBranchSummarySettings().reserveTokens,
				});
				if (result.aborted) return { cancelled: true };
				if (result.error) throw new Error(result.error);
				summaryText = result.summary;
				summaryDetails = {
					readFiles: result.readFiles || [],
					modifiedFiles: result.modifiedFiles || [],
				};
			} else if (extensionSummary) {
				summaryText = extensionSummary.summary;
				summaryDetails = extensionSummary.details;
			}

			let newLeafId: string | null;
			if (targetEntry.type === "message" && targetEntry.message.role === "user") {
				newLeafId = targetEntry.parentId;
			} else if (targetEntry.type === "custom_message") {
				newLeafId = targetEntry.parentId;
			} else {
				newLeafId = targetId;
			}

			let summaryEntry: BranchSummaryEntry | undefined;
			if (summaryText) {
				const appended = await assembly.historyController.appendBranchSummary(
					newLeafId,
					summaryText,
					summaryDetails,
					fromExtension,
				);
				summaryEntry = createGreenfieldReadonlySessionManager(session.createCoreAssembly()).getEntry(
					appended.entryId,
				) as BranchSummaryEntry;
				if (label) await assembly.metadataController.setLabel(appended.entryId, label);
			} else {
				await assembly.historyController.navigateForEdit(targetId);
				if (label) await assembly.metadataController.setLabel(targetId, label);
			}

			await runner.emit({
				type: "session_tree",
				newLeafId: createGreenfieldReadonlySessionManager(session.createCoreAssembly()).getLeafId(),
				oldLeafId,
				summaryEntry,
				fromExtension: summaryText ? fromExtension : undefined,
			});
			return { cancelled: false };
		} finally {
			abortController.abort();
		}
	}
}
