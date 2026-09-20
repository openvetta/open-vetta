// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PluginAiApi, PluginCommandApi, PluginCommandRunResult } from "@vetta-org/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommitComposer } from "../src/components/CommitComposer";
import { setGitAi, setGitCommand } from "../src/git/runtime";
import type { ChangeEntry } from "../src/git/types";

const { translate } = vi.hoisted(() => {
	const copy: Record<string, string> = {
		"commit.placeholder": "Commit message",
		"commit.generate": "Generate commit message",
		"commit.generating": "Generating…",
		"commit.submit": "Commit",
		"commit.committing": "Committing…",
		"commit.empty": "Enter a commit message first.",
		"commit.generate.empty": "The model did not return a usable commit message.",
	};
	return { translate: (key: string) => copy[key] ?? key };
});

vi.mock("@vetta-org/plugin-sdk", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		useTranslation: () => ({
			locale: "en",
			t: translate,
		}),
	};
});

const ENTRIES: ChangeEntry[] = [{ path: "src/login.ts", code: "M", staged: false }];

function ok(stdout = ""): PluginCommandRunResult {
	return { stdout, stderr: "", exitCode: 0 };
}

function installCommand(handler: (args: string[]) => PluginCommandRunResult): string[][] {
	const calls: string[][] = [];
	const api: PluginCommandApi = {
		run: async (_file, args = []) => {
			calls.push(args);
			return handler(args);
		},
		spawn: async () => {
			throw new Error("spawn is unused");
		},
	};
	setGitCommand(api);
	return calls;
}

function installAi(complete: PluginAiApi["complete"]): void {
	setGitAi({
		listModels: async () => ({ defaultModel: null, models: [] }),
		complete,
		stream: async (request) => complete(request),
		chat: async () => {
			throw new Error("chat is unused");
		},
	});
}

beforeEach(() => {
	installCommand(() => ok());
	installAi(async () => ({
		modelKey: "default",
		text: "feat: login",
		stopReason: "stop",
		usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
	}));
});

afterEach(cleanup);

describe("CommitComposer", () => {
	it("fills the message box from the model when the user generates a commit message", async () => {
		installCommand((args) => {
			if (args[0] === "diff" && args[1] === "HEAD") return ok("+return true;");
			if (args[0] === "ls-files") return ok("");
			if (args[0] === "log") return ok("chore: setup");
			return ok();
		});
		installAi(async (request) => {
			expect(request.prompt).toContain("M src/login.ts");
			expect(request.prompt).toContain("+return true;");
			return {
				modelKey: "default",
				text: "```\nfix: login button\n```",
				stopReason: "stop",
				usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};
		});

		render(<CommitComposer root="/repo" entries={ENTRIES} />);

		fireEvent.click(screen.getByRole("button", { name: "Generate commit message" }));

		await waitFor(() =>
			expect((screen.getByPlaceholderText("Commit message") as HTMLTextAreaElement).value).toBe("fix: login button"),
		);
	});

	it("stages all changes and commits the edited message", async () => {
		const calls = installCommand(() => ok());

		render(<CommitComposer root="/repo" entries={ENTRIES} />);

		fireEvent.change(screen.getByPlaceholderText("Commit message"), {
			target: { value: "feat: login form" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Commit" }));

		await waitFor(() => {
			expect(calls).toEqual([
				["add", "-A"],
				["commit", "-m", "feat: login form"],
			]);
		});
		expect((screen.getByPlaceholderText("Commit message") as HTMLTextAreaElement).value).toBe("");
	});

	it("does not commit when the message box is empty", async () => {
		const calls = installCommand(() => ok());

		render(<CommitComposer root="/repo" entries={ENTRIES} />);
		fireEvent.click(screen.getByRole("button", { name: "Commit" }));

		expect(await screen.findByText("Enter a commit message first.")).toBeTruthy();
		expect(calls).toEqual([]);
	});
});
