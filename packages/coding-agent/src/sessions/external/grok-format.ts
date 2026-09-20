import type { SessionHistoryInfo } from "@vetta/runtime-core";
import type { ExternalSessionBriefingSource, ExternalSessionFormat } from "./format.js";
import {
	EXTERNAL_SESSION_HISTORY_UNAVAILABLE,
	projectGrokConversationBriefingRounds,
	projectGrokConversationDisplay,
} from "./grok-conversation.js";
import {
	findGrokSummaryHeader,
	GROK_CONVERSATION_BODY_NAME,
	GROK_HEADER_SCAN_LINES,
	GROK_SUMMARY_SIDECAR_NAME,
	GROK_TOOL_ID,
	type GrokSummaryHeader,
} from "./grok-summary.js";
import type { ExternalSessionFileHost } from "./host-contracts.js";

export const grokFormat: ExternalSessionFormat = {
	id: GROK_TOOL_ID,
	ownsIdentity(path, host) {
		if (host.basename(path) !== GROK_SUMMARY_SIDECAR_NAME) return false;
		try {
			return findGrokSummaryHeader(host.readPrefixLines(path, GROK_HEADER_SCAN_LINES)).kind === "ok";
		} catch {
			return false;
		}
	},
	canRead(path, host) {
		if (host.basename(path) !== GROK_SUMMARY_SIDECAR_NAME) return false;
		try {
			return findGrokSummaryHeader(host.readPrefixLines(path, GROK_HEADER_SCAN_LINES)).kind !== "unrelated";
		} catch {
			return false;
		}
	},
	async collectIdentities(root, host) {
		if (!host.exists(root)) return [];
		const sidecars: string[] = [];
		try {
			for (const workspace of await host.readDirectory(root)) {
				if (workspace.kind !== "directory") continue;
				const workspacePath = host.join(root, workspace.name);
				for (const session of await host.readDirectory(workspacePath)) {
					if (session.kind !== "directory") continue;
					const sidecarPath = host.join(workspacePath, session.name, GROK_SUMMARY_SIDECAR_NAME);
					if (host.exists(sidecarPath)) sidecars.push(sidecarPath);
				}
			}
		} catch {
			return [];
		}
		return sidecars;
	},
	async projectListItem(path, host, cutoff) {
		let header: GrokSummaryHeader;
		try {
			header = findGrokSummaryHeader(host.readPrefixLines(path, GROK_HEADER_SCAN_LINES));
		} catch {
			return unavailableGrokItem(host, path, "corrupted_header", cutoff, undefined);
		}
		if (header.kind === "unrelated") return undefined;
		if (header.kind === "ok") {
			if (header.summary.lastActiveAt < cutoff) return undefined;
			return {
				id: header.summary.id,
				path,
				cwd: header.summary.cwd,
				name: header.summary.title || undefined,
				firstMessage: header.summary.title,
				modifiedAt: header.summary.lastActiveAt,
				origin: { tool: GROK_TOOL_ID, path },
			};
		}
		if (header.kind === "unsupported_version") {
			return unavailableGrokItem(host, path, "unsupported_version", cutoff, {
				id: header.id,
				cwd: header.cwd,
				title: header.title,
			});
		}
		return unavailableGrokItem(host, path, "corrupted_header", cutoff, undefined);
	},
	readHistory(path, host) {
		const header = findGrokSummaryHeader(host.readPrefixLines(path, GROK_HEADER_SCAN_LINES));
		if (header.kind === "corrupted_header" || header.kind === "unrelated") {
			throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.corrupted_header);
		}
		if (header.kind === "unsupported_version") {
			throw new Error(EXTERNAL_SESSION_HISTORY_UNAVAILABLE.unsupported_version);
		}
		const bodyPath = host.join(host.join(path, ".."), GROK_CONVERSATION_BODY_NAME);
		if (!host.exists(bodyPath)) return projectGrokConversationDisplay("");
		return projectGrokConversationDisplay(host.readText(bodyPath));
	},
	readBriefingSource(path, host) {
		const header = findGrokSummaryHeader(host.readPrefixLines(path, GROK_HEADER_SCAN_LINES));
		if (header.kind === "corrupted_header" || header.kind === "unrelated") {
			return { error: "corrupted_header" };
		}
		if (header.kind === "unsupported_version") {
			return { error: "unsupported_version" };
		}
		const bodyPath = host.join(host.join(path, ".."), GROK_CONVERSATION_BODY_NAME);
		const body = host.exists(bodyPath) ? host.readText(bodyPath) : "";
		const title = header.summary.title;
		return {
			tool: GROK_TOOL_ID,
			cwd: header.summary.cwd,
			title,
			supplement: title,
			rounds: projectGrokConversationBriefingRounds(body),
			identityPath: path,
			bodyPath: host.exists(bodyPath) ? bodyPath : undefined,
		} satisfies ExternalSessionBriefingSource;
	},
};

async function unavailableGrokItem(
	host: ExternalSessionFileHost,
	sidecarPath: string,
	reason: "unsupported_version" | "corrupted_header",
	cutoff: number,
	known: { readonly id: string; readonly cwd: string; readonly title: string } | undefined,
): Promise<SessionHistoryInfo | undefined> {
	const modifiedAt = await host.statModifiedAt(sidecarPath).catch(() => 0);
	if (modifiedAt > 0 && modifiedAt < cutoff) return undefined;
	return {
		id: known?.id || host.basename(host.join(sidecarPath, "..")),
		path: sidecarPath,
		cwd: known?.cwd ?? "",
		name: known?.title || undefined,
		firstMessage: known?.title ?? "",
		modifiedAt,
		origin: { tool: GROK_TOOL_ID, path: sidecarPath },
		unavailableReason: reason,
	};
}
