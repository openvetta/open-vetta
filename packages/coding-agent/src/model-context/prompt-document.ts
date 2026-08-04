/** Structured system-prompt document and deterministic mutation/rendering operations. */

export type SystemPromptBlockType =
	| "subconscious"
	| "base"
	| "tools"
	| "mcp"
	| "guidelines"
	| "append"
	| "context"
	| "memory"
	| "skills"
	| "mode"
	| "personalization"
	| "footer"
	| "plugin";

export interface SystemPromptBlock {
	id: string;
	type: SystemPromptBlockType;
	source: {
		kind: "core" | "plugin";
		pluginId?: string;
	};
	content: string;
	priority: number;
	enabled: boolean;
}

export interface SystemPromptDraft {
	blocks: SystemPromptBlock[];
	metadata: {
		cwd: string;
		dateTime: string;
	};
}

export type SystemPromptBlockPatch = Partial<Omit<SystemPromptBlock, "id">>;

export type SystemPromptOperation =
	| { type: "addBlock"; block: SystemPromptBlock }
	| { type: "replaceBlock"; blockId: string; block: SystemPromptBlock }
	| { type: "updateBlock"; blockId: string; patch: SystemPromptBlockPatch }
	| { type: "removeBlock"; blockId: string }
	| { type: "setBlockEnabled"; blockId: string; enabled: boolean };

export interface SystemPromptContribution {
	pluginId: string;
	operations: SystemPromptOperation[];
}

export function coreBlock(
	id: string,
	type: SystemPromptBlockType,
	content: string,
	priority: number,
): SystemPromptBlock {
	return {
		id,
		type,
		source: { kind: "core" },
		content,
		priority,
		enabled: content.length > 0,
	};
}

export function applySystemPromptOperation(
	draft: SystemPromptDraft,
	pluginId: string,
	operation: SystemPromptOperation,
): void {
	switch (operation.type) {
		case "addBlock":
			draft.blocks.push({
				...operation.block,
				source: { kind: "plugin", pluginId },
			});
			return;
		case "replaceBlock": {
			const index = draft.blocks.findIndex((block) => block.id === operation.blockId);
			const nextBlock: SystemPromptBlock = {
				...operation.block,
				id: operation.blockId,
				source: { kind: "plugin", pluginId },
			};
			if (index >= 0) {
				draft.blocks[index] = nextBlock;
			} else {
				draft.blocks.push(nextBlock);
			}
			return;
		}
		case "updateBlock": {
			const block = draft.blocks.find((candidate) => candidate.id === operation.blockId);
			if (block) {
				Object.assign(block, operation.patch);
			}
			return;
		}
		case "removeBlock":
			draft.blocks = draft.blocks.filter((block) => block.id !== operation.blockId);
			return;
		case "setBlockEnabled": {
			const block = draft.blocks.find((candidate) => candidate.id === operation.blockId);
			if (block) {
				block.enabled = operation.enabled;
			}
			return;
		}
	}
}

export function applySystemPromptOperations(
	draft: SystemPromptDraft,
	pluginId: string,
	operations: readonly SystemPromptOperation[],
): SystemPromptDraft {
	const nextDraft: SystemPromptDraft = {
		blocks: draft.blocks.map((block) => ({ ...block, source: { ...block.source } })),
		metadata: { ...draft.metadata },
	};
	for (const operation of operations) {
		applySystemPromptOperation(nextDraft, pluginId, operation);
	}
	return nextDraft;
}

export function renderSystemPromptDraft(draft: SystemPromptDraft): string {
	return draft.blocks
		.filter((block) => block.enabled && block.content.length > 0)
		.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
		.map((block) => block.content)
		.join("\n\n");
}
