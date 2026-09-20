import type { PluginAiCompleteRequest } from "@vetta-org/plugin-sdk";
import type { ChangeEntry } from "./types";

export const COMMIT_DIFF_BUDGET = 24_000;

export const COMMIT_SYSTEM_PROMPT = `You write Git commit messages for a developer.
Reply with the commit message only. No quotes, no markdown fences, no commentary.
First line at most 72 characters. Use a conventional-commits type prefix when it is obvious (feat, fix, docs, refactor, test, chore, perf).
Add a body after a blank line only when the change needs it.
Match the language of the code comments and identifiers; if mixed, use English.`;

export function sanitizeCommitMessage(raw: string): string | null {
	let text = raw.replace(/^\uFEFF/, "").trim();
	if (text.startsWith("```") && text.endsWith("```")) {
		text = text.replace(/^```(?:\w+)?\r?\n?/, "").replace(/\n?```$/, "").trim();
	}
	if (
		(text.startsWith('"') && text.endsWith('"') && text.length >= 2) ||
		(text.startsWith("'") && text.endsWith("'") && text.length >= 2)
	) {
		text = text.slice(1, -1).trim();
	}
	text = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
	if (!text) return null;
	const firstLine = text.split("\n", 1)[0] ?? "";
	if (firstLine.startsWith("-")) return null;
	if (text.length > 8_000) text = text.slice(0, 8_000).trimEnd();
	return text;
}

export function formatChangeSummary(entries: readonly ChangeEntry[]): string {
	return entries.map((entry) => `${entry.code} ${entry.path}`).join("\n");
}

export function clipCommitDiff(diff: string): string {
	if (diff.length <= COMMIT_DIFF_BUDGET) return diff;
	return `${diff.slice(0, COMMIT_DIFF_BUDGET)}\n\n[diff truncated]`;
}

export function buildCommitGenerationRequest(input: {
	entries: readonly ChangeEntry[];
	diff: string;
	recentSubjects: readonly string[];
}): PluginAiCompleteRequest {
	const files = formatChangeSummary(input.entries) || "(none)";
	const recent = input.recentSubjects.length > 0 ? input.recentSubjects.join("\n") : "(no previous commits)";
	const diff = clipCommitDiff(input.diff) || "(empty diff)";
	return {
		systemPrompt: COMMIT_SYSTEM_PROMPT,
		prompt: `Recent commit subjects:\n${recent}\n\nChanged files:\n${files}\n\nDiff:\n${diff}`,
		temperature: 0.2,
		maxTokens: 300,
	};
}
