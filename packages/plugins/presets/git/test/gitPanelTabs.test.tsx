// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitPanel } from "../src/components/GitPanel";
import { setGitCommand, setPanelResizer } from "../src/git/runtime";

vi.mock("@vetta-org/plugin-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/plugin-sdk")>();
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
		useActivityTab: () => ({ cwd: "/repo" }),
	};
});

const HASH = "a".repeat(40);
const PORCELAIN = "1 .M N... 100644 100644 100644 0000000 0000000 src/main.ts\n";

beforeEach(() => {
	Object.defineProperty(CSSStyleSheet.prototype, "replaceSync", { configurable: true, value() {} });
	Element.prototype.scrollIntoView = vi.fn();
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 900, 600));
	vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	vi.stubGlobal(
		"IntersectionObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
	setPanelResizer(() => {});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

function setup() {
	const calls: string[][] = [];
	setGitCommand({
		run: async (_file: string, args: string[] = []) => {
			calls.push(args);
			if (args[0] === "rev-parse" && args.includes("--show-toplevel")) return { exitCode: 0, stdout: "/repo\n", stderr: "" };
			if (args[0] === "status") return { exitCode: 0, stdout: PORCELAIN, stderr: "" };
			if (args[0] === "branch" && args.includes("--show-current")) return { exitCode: 0, stdout: "dev\n", stderr: "" };
			if (args[0] === "branch") return { exitCode: 0, stdout: `dev ${HASH}\n`, stderr: "" };
			if (args[0] === "log") return { exitCode: 0, stdout: "", stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		},
	});
	render(<GitPanel />);
	return { calls };
}

describe("git panel view switcher", () => {
	it("switches between changes and graph from the host segmented control", async () => {
		const { calls } = setup();

		// 宿主的 SegmentedControl：两个分段都是按钮，标签即视图名。
		const changesTab = await screen.findByRole("button", { name: /view\.tabChanges/ });
		const graphTab = screen.getByRole("button", { name: /view\.tabGraph/ });

		// 分段里带着「有多少个改动」的计数（porcelain 里只有一个文件）。
		expect(changesTab.textContent).toContain("1");

		fireEvent.click(graphTab);
		await waitFor(() => expect(calls.some((args) => args[0] === "log")).toBe(true));
		expect(await screen.findByTitle("branch.placeholder")).toBeTruthy();

		fireEvent.click(changesTab);
		await waitFor(() => expect(screen.getByTitle("action.refresh")).toBeTruthy());
		expect(screen.queryByTitle("branch.placeholder")).toBeNull();
	});
});
