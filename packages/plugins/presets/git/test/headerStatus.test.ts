import { describe, expect, it } from "vitest";
import { planCommit } from "../src/git/commitFlow";
import { summarizeStatus } from "../src/git/headerStatus";
import type { StatusGroups } from "../src/git/types";

const entry = (path: string) => ({ path, code: "M" as const });

function groups(parts: Partial<StatusGroups> = {}): StatusGroups {
	return { conflict: [], staged: [], unstaged: [], ...parts };
}

describe("planCommit", () => {
	it("blocks when a merge is in progress, whatever else is staged", () => {
		const plan = planCommit(groups({ staged: [entry("a.ts")], conflict: [entry("b.ts")] }), "fix: x");
		expect(plan.blocked).toBe("conflict");
		expect(plan.canCommit).toBe(false);
	});

	it("blocks when there is nothing to commit", () => {
		expect(planCommit(groups(), "fix: x").blocked).toBe("empty");
	});

	it("stages everything when the index is empty but the worktree is dirty", () => {
		const plan = planCommit(groups({ unstaged: [entry("a.ts")] }), "feat: y");
		expect(plan.stageAll).toBe(true);
		expect(plan.canCommit).toBe(true);
	});

	it("commits only the index when something is already staged", () => {
		const plan = planCommit(groups({ staged: [entry("a.ts")], unstaged: [entry("b.ts")] }), "feat: y");
		expect(plan.stageAll).toBe(false);
	});

	it("needs a non-blank message", () => {
		const dirty = groups({ unstaged: [entry("a.ts")] });
		expect(planCommit(dirty, "   ").canCommit).toBe(false);
		expect(planCommit(dirty, "feat: z").canCommit).toBe(true);
	});
});

describe("summarizeStatus", () => {
	it("counts a file once even when it is both staged and edited", () => {
		const status = summarizeStatus(groups({ staged: [entry("a.ts")], unstaged: [entry("a.ts")] }), {
			branch: "main",
			ahead: 0,
			behind: 0,
			published: true,
		});
		expect(status.files).toBe(1);
		expect(status.branch).toBe("main");
	});

	it("keeps conflicts apart so the header can shout about them", () => {
		const status = summarizeStatus(groups({ conflict: [entry("a.ts")], staged: [entry("b.ts")] }), {
			branch: "main",
			ahead: 2,
			behind: 1,
			published: true,
		});
		expect(status).toMatchObject({ files: 2, conflict: 1, ahead: 2, behind: 1 });
	});
});
