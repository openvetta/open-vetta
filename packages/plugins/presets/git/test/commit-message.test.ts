import { describe, expect, it } from "vitest";
import {
	COMMIT_DIFF_BUDGET,
	buildCommitGenerationRequest,
	sanitizeCommitMessage,
} from "../src/git/commit-message";
import type { ChangeEntry } from "../src/git/types";

describe("sanitizeCommitMessage", () => {
	it("trims whitespace and keeps a subject plus body", () => {
		expect(sanitizeCommitMessage("  feat: login\n\nHandle empty password.  \n")).toBe(
			"feat: login\n\nHandle empty password.",
		);
	});

	it("unwraps a fenced markdown block including a language tag", () => {
		expect(sanitizeCommitMessage("```markdown\nfix: button\n\nIt did nothing.\n```\n")).toBe(
			"fix: button\n\nIt did nothing.",
		);
	});

	it("unwraps a single pair of surrounding quotes", () => {
		expect(sanitizeCommitMessage('"chore: bump deps"')).toBe("chore: bump deps");
	});

	it("returns null for empty, whitespace-only, or fence-only input", () => {
		expect(sanitizeCommitMessage("")).toBeNull();
		expect(sanitizeCommitMessage("   \n\t")).toBeNull();
		expect(sanitizeCommitMessage("```\n```")).toBeNull();
	});

	it("rejects a message whose first line would be parsed as a git flag", () => {
		expect(sanitizeCommitMessage("-m oops")).toBeNull();
		expect(sanitizeCommitMessage("--amend")).toBeNull();
	});
});

describe("buildCommitGenerationRequest", () => {
	const entries: ChangeEntry[] = [
		{ path: "src/login.ts", code: "M", staged: false },
		{ path: "README.md", code: "A", staged: true },
	];

	it("sends the changed paths, recent subjects, and diff to the model", () => {
		const request = buildCommitGenerationRequest({
			entries,
			diff: "diff --git a/src/login.ts b/src/login.ts\n+return true;",
			recentSubjects: ["fix: crash on empty name", "feat: add login form"],
		});

		expect(request.systemPrompt).toContain("commit message");
		expect(request.prompt).toContain("M src/login.ts");
		expect(request.prompt).toContain("A README.md");
		expect(request.prompt).toContain("fix: crash on empty name");
		expect(request.prompt).toContain("+return true;");
		expect(request.maxTokens).toBe(300);
	});

	it("clips an oversized diff and notes the truncation", () => {
		const request = buildCommitGenerationRequest({
			entries,
			diff: "x".repeat(COMMIT_DIFF_BUDGET + 50),
			recentSubjects: [],
		});

		expect(request.prompt.length).toBeLessThan(COMMIT_DIFF_BUDGET + 2000);
		expect(request.prompt).toContain("[diff truncated]");
	});
});
