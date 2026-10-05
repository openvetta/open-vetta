import { describe, expect, it } from "vitest";
import { getPersonaPrompt } from "../src/profiles/personas.js";

describe("interactive persona", () => {
	it("asks about material unanswered decisions without requiring a second go-ahead", () => {
		const prompt = getPersonaPrompt("interactive");
		expect(prompt).toContain("materially change the outcome");
		expect(prompt).toContain("cannot be resolved from available context");
		expect(prompt).toContain("The user's request authorizes ordinary work within its scope");
		expect(prompt).not.toContain("until you are fully confident");
		expect(prompt).not.toContain("must obtain the user's explicit go-ahead");
	});

	it("preserves safety approvals and a user's request to approve before execution", () => {
		const prompt = getPersonaPrompt("interactive");
		expect(prompt).toContain("Follow all safety, permission, and approval requirements");
		expect(prompt).toContain("asks to review or approve before execution");
		expect(prompt).toContain("stop at that point and wait");
	});
});
