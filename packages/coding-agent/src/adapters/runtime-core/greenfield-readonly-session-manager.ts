import { dirname } from "node:path";
import type { AgentMessage } from "@vetta/agent-core";
import type { ConversationDocument, GreenfieldRuntimeSessionCoreAssembly } from "@vetta/runtime-core";
import type { ConversationDocumentEntry } from "@vetta/runtime-core/conversation";
import { buildSessionTree } from "../../core/session-manager/branch-ops.js";
import type {
	CustomMessageEntry,
	ReadonlySessionManager,
	SessionEntry,
	SessionHeader,
	SessionTreeNode,
} from "../../core/session-manager/index.js";
import { CURRENT_SESSION_VERSION } from "../../core/session-manager/index.js";
import { restoreCodingAgentLegacyAgentMessageEntry } from "./legacy-session-import-normalizer.js";

/**
 * 将 Runtime Core 的只读 Conversation 投影为旧 ExtensionContext 所需的窄会话视图。
 *
 * 该适配器不持有 Repository，也不开放 Legacy 写 API；每次读取都基于当前
 * ConversationDocument，因此续接、分支切换和元数据更新会即时可见。
 */
export function createGreenfieldReadonlySessionManager(
	assembly: GreenfieldRuntimeSessionCoreAssembly,
): ReadonlySessionManager {
	const readDocument = (): ConversationDocument => assembly.conversationView.readDocument();
	const readEntries = (): SessionEntry[] => readDocument().entries.map(toSessionEntry);
	const readCwd = (): string => assembly.workspaceView.readWorkingDirectory() ?? readDocument().identity.cwd ?? "";

	return {
		getCwd: readCwd,
		getSessionDir: () => {
			const sessionPath = assembly.lifecycle.sessionPath;
			return sessionPath ? dirname(sessionPath) : readCwd();
		},
		getSessionId: () => readDocument().identity.sessionId,
		getSessionFile: () => assembly.lifecycle.sessionPath,
		getLeafId: () => readDocument().activeLeafId,
		getLeafEntry: () => {
			const document = readDocument();
			const entry = document.activeLeafId
				? document.entries.find(({ id }) => id === document.activeLeafId)
				: undefined;
			return entry ? toSessionEntry(entry) : undefined;
		},
		getEntry: (id) => {
			const entry = readDocument().entries.find((candidate) => candidate.id === id);
			return entry ? toSessionEntry(entry) : undefined;
		},
		getLabel: (id) => readLabels(readDocument()).get(id),
		getBranch: (fromId) => readBranch(readDocument(), fromId),
		getHeader: () => toSessionHeader(readDocument()),
		getEntries: readEntries,
		getTree: (): SessionTreeNode[] => {
			const document = readDocument();
			return buildSessionTree(document.entries.map(toSessionEntry), readLabels(document));
		},
		getSessionName: () => readDocument().name,
	};
}

function toSessionHeader(document: ConversationDocument): SessionHeader {
	return {
		type: "session",
		version: CURRENT_SESSION_VERSION,
		id: document.identity.sessionId,
		timestamp: new Date(document.identity.createdAt).toISOString(),
		cwd: document.identity.cwd ?? "",
		parentSession: document.identity.parentSessionPath,
		parentEntryId: document.identity.parentEntryId,
	};
}

function readLabels(document: ConversationDocument): Map<string, string> {
	const labels = new Map<string, string>();
	for (const entry of document.entries) {
		if (entry.type !== "label") continue;
		if (entry.label === undefined) labels.delete(entry.targetId);
		else labels.set(entry.targetId, entry.label);
	}
	return labels;
}

function readBranch(document: ConversationDocument, fromId?: string): SessionEntry[] {
	const byId = new Map(document.entries.map((entry) => [entry.id, entry]));
	const branch: SessionEntry[] = [];
	let current = fromId ? byId.get(fromId) : document.activeLeafId ? byId.get(document.activeLeafId) : undefined;
	while (current) {
		branch.unshift(toSessionEntry(current));
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}
	return branch;
}

function toSessionEntry(entry: ConversationDocumentEntry): SessionEntry {
	switch (entry.type) {
		case "message":
			return { ...entry, message: entry.message as AgentMessage };
		case "custom_message":
			return (
				restoreCodingAgentLegacyAgentMessageEntry(entry) ?? {
					...entry,
					content: entry.content as CustomMessageEntry["content"],
				}
			);
		case "tool_timing":
			return { ...entry, phases: [...entry.phases] };
		case "label":
			return { ...entry, label: entry.label };
		case "compaction": {
			const { reason: _reason, summaryMessage: _summaryMessage, ...legacyEntry } = entry;
			return legacyEntry;
		}
		default:
			return { ...entry };
	}
}
