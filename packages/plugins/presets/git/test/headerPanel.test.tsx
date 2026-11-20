// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitHeaderPanel } from "../src/components/HeaderStatusAction";
import { setHeaderRepoCwd } from "../src/git/headerStatus";
import { setGitCommand, setPanelOpener } from "../src/git/runtime";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => (values ? `${key}:${JSON.stringify(values)}` : key), locale: "en" }),
	readJsonFile: async () => null,
	writeJsonFile: async () => {},
}));

const hash = "a".repeat(40);

/** 一份「索引为空、工作区有一个改动」的 porcelain 输出。 */
const PORCELAIN = "1 .M N... 100644 100644 100644 0000000 0000000 src/main.ts";

function setup(options: { resolveDelayMs?: number; upstream?: boolean } = {}) {
	const calls: string[][] = [];
	const run = vi.fn(async (_file: string, args: string[] = []) => {
		if (args[0] === "rev-parse" && args.includes("--show-toplevel") && options.resolveDelayMs) {
			await new Promise((resolve) => setTimeout(resolve, options.resolveDelayMs));
		}
		calls.push(args);
		let stdout = "";
		let exitCode = 0;
		if (args[0] === "rev-parse" && args.includes("--show-toplevel")) stdout = "/repo\n";
		else if (args[0] === "status") stdout = PORCELAIN;
		else if (args[0] === "branch" && args.includes("--show-current")) stdout = "main\n";
		else if (args[0] === "branch") stdout = `main ${hash}\n`;
		else if (args[0] === "rev-parse" && args.includes("--abbrev-ref")) {
			// 没有 upstream 时 git 以 128 退出；这条分支决定推送前是否要问一句「发布分支」。
			if (options.upstream) stdout = "origin/main\n";
			else exitCode = 128;
		} else if (args[0] === "rev-list") stdout = "0\t1\n";
		return { stdout, stderr: "", exitCode };
	});
	setGitCommand({ run } as never);
	setHeaderRepoCwd("/repo");
	return { calls, run };
}

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("GitHeaderPanel", () => {
	let closeSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		closeSpy = vi.fn();
	});

	it("shows the current branch and commits a typed message", async () => {
		const { calls } = setup();
		render(<GitHeaderPanel close={() => {}} />);

		// 分支名从 git 读出来，不是占位文本。
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());

		const box = screen.getByPlaceholderText("header.commitPlaceholder") as HTMLTextAreaElement;
		await act(async () => {
			fireEvent.change(box, { target: { value: "feat: add header status" } });
		});

		const commit = screen.getByText("header.stageAllCommit").closest("button") as HTMLButtonElement;
		expect(commit.disabled).toBe(false);
		await act(async () => {
			fireEvent.click(commit);
		});

		// 索引为空：提交前先全部暂存，消息原样传给 git。
		await waitFor(() => expect(calls.some((args) => args[0] === "commit")).toBe(true));
		expect(calls).toContainEqual(["add", "-A"]);
		expect(calls).toContainEqual(["commit", "-m", "feat: add header status"]);
	});

	it("keeps commit disabled until a message is typed", async () => {
		setup();
		render(<GitHeaderPanel close={() => {}} />);
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());
		const commit = screen.getByText("header.stageAllCommit").closest("button") as HTMLButtonElement;
		expect(commit.disabled).toBe(true);
	});

	it("does not claim the folder is not a repo while the first probe is still running", async () => {
		// 用一个还没被缓存过的目录：这是气泡第一次打开、顶栏也没得参考的那一瞬。
		const { run } = setup({ resolveDelayMs: 120 });
		setHeaderRepoCwd("/fresh-repo");
		void run;
		render(<GitHeaderPanel close={() => {}} />);

		// 首帧：还没解析出仓库根，不能报「不是仓库」，也不该出现可操作界面。
		expect(screen.queryByText("header.notRepo")).toBeNull();
		expect(document.querySelector("[aria-busy=true]")).not.toBeNull();

		// 解析完成后才落到正常界面。
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());
		expect(screen.queryByText("header.notRepo")).toBeNull();
	});

	it("only reports a non-repo folder once the probe actually concludes that", async () => {
		const run = vi.fn(async () => ({ stdout: "", stderr: "not a git repository", exitCode: 128 }));
		setGitCommand({ run } as never);
		setHeaderRepoCwd("/not-a-repo");
		render(<GitHeaderPanel close={() => {}} />);
		await waitFor(() => expect(screen.getByText("header.notRepo")).toBeTruthy());
	});

	it("keeps the commit-and-push variant behind the dropdown next to the commit button", async () => {
		const { calls } = setup({ upstream: true });
		render(<GitHeaderPanel close={() => {}} />);
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());

		await act(async () => {
			fireEvent.change(screen.getByPlaceholderText("header.commitPlaceholder"), {
				target: { value: "feat: header polish" },
			});
		});

		// 主键在明面上，其余提交方式收在下拉里（与面板同一套结构）。
		expect(screen.getByText("header.stageAllCommit")).toBeTruthy();
		expect(screen.queryByText("header.commitAndPush")).toBeNull();

		// jsdom 里没有真正的指针事件可用，用键盘打开菜单（Radix 对两者走同一条打开路径）。
		const more = screen.getByTitle("commit.more") as HTMLButtonElement;
		await act(async () => {
			fireEvent.keyDown(more, { key: "Enter" });
		});
		const item = await screen.findByText("header.commitAndPush");
		await act(async () => {
			fireEvent.click(item);
		});

		await waitFor(() => expect(calls.some((args) => args[0] === "push")).toBe(true));
		expect(calls).toContainEqual(["commit", "-m", "feat: header polish"]);
	});

	it("offers a one-click way out to the full panel", async () => {
		setup();
		const events: string[] = [];
		setPanelOpener(() => events.push("open-panel"));
		render(<GitHeaderPanel close={() => events.push("close-popover")} />);
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());

		await act(async () => {
			fireEvent.click(screen.getByTitle("header.openPanel"));
		});

		// 气泡先关掉，再让面板拿到焦点：否则浮层还盖在面板上面。
		expect(events).toEqual(["close-popover", "open-panel"]);
	});
});
