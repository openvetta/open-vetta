import { describe, expect, test } from "vitest";
import { buildSystemPrompt, VETTA_CLI_GUIDANCE } from "../src/core/system-prompt.js";

describe("VETTA_CLI_GUIDANCE", () => {
	test("explains that Vetta CLI can inspect and operate Desktop capabilities", () => {
		expect(VETTA_CLI_GUIDANCE).toContain("use `vetta action` both to learn what Desktop can do and to operate it");
		expect(VETTA_CLI_GUIDANCE).toContain("Batch tasks and scheduled tasks");
		expect(VETTA_CLI_GUIDANCE).toContain("queried and managed through these actions");
	});
});

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		test("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Available tools:\n(none)");
		});

		test("shows file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: [],
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("Show file paths clearly");
		});
	});

	describe("default tools", () => {
		test("includes all default tools", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [],
				skills: [],
			});

			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});
	});
});
