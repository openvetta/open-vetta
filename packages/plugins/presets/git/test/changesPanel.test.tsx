// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GitChanges } from "../src/components/GitChanges";
import { setGitCommand } from "../src/git/runtime";
import type { StatusGroups } from "../src/git/types";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
}));

// 两个改动文件刻意放在不同层级深目录里：平铺后只留文件名，目录不再挤进行内。
const NESTED = "packages/plugins/presets/git/src/components/GitChanges.tsx";
const SHALLOW = "apps/desktop/src/main/index.ts";

const groups: StatusGroups = {
	conflict: [],
	staged: [],
	unstaged: [
		{ path: NESTED, code: "M" },
		{ path: SHALLOW, code: "D" },
	],
};

const patch = (path: string) =>
	`diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-old\n+${path}\n`;

beforeEach(() => {
	localStorage.clear();
	Object.defineProperty(CSSStyleSheet.prototype, "replaceSync", { configurable: true, value() {} });
	// jsdom 没有布局：给面板一个够宽的视口，让它走「列表 + diff」的双栏布局。
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 900, 600));
	// 分区高度分配要可量的容器高度，所以 clientHeight 单独给一档。
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
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

/** 用原生指针事件驱动手柄：jsdom 里 fireEvent.pointer* 依赖 PointerEvent，直接派发鼠标事件更稳。 */
function drag(handle: HTMLElement, fromY: number, toY: number): void {
	handle.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientY: fromY }));
	window.dispatchEvent(new MouseEvent("pointermove", { clientY: toY }));
	window.dispatchEvent(new MouseEvent("pointerup", {}));
}

/** 同时有暂存与未暂存两段的分区，用来验证分区之间的拉伸。 */
const MIXED: StatusGroups = {
	conflict: [],
	staged: [
		{ path: "packages/plugins/presets/git/src/staged-a.ts", code: "M" },
		{ path: "packages/plugins/presets/git/src/staged-b.ts", code: "A" },
	],
	unstaged: [
		{ path: NESTED, code: "M" },
		{ path: SHALLOW, code: "D" },
	],
};

function setup(sections: StatusGroups = groups) {
	const run = vi.fn(async (_file: string, args: string[] = []) => ({ exitCode: 0, stderr: "", stdout: patch(args.at(-1) ?? "") }));
	setGitCommand({ run });
	const view = render(<GitChanges root="/repo" groups={sections} onOpenGraph={() => {}} />);
	// 行的 title 是完整路径，用它定位行；行内文本即「文件名 + 状态字母」。
	const row = (path: string): HTMLElement => {
		const el = view.container.querySelector<HTMLElement>(`button[title="${path}"]`);
		if (!el) throw new Error(`row missing: ${path}`);
		return el;
	};
	return { ...view, run, row };
}

describe("changes panel", () => {
	it("lists nested files flat with only their file names", async () => {
		const { row } = setup();

		expect(row(NESTED).textContent).toBe("GitChanges.tsxM");
		expect(row(SHALLOW).textContent).toBe("index.tsD");
		// 目录名一个都不该进行内文本（这正是平铺要解决的信息挤占）。
		expect(row(NESTED).textContent).not.toContain("components");
		expect(row(SHALLOW).textContent).not.toContain("src");
	});

	it("gives each row the icon of its file type", async () => {
		const { row } = setup();

		// 两种扩展名必须拿到不同的类型图标，而不是一律那张白纸图标。
		const tokenOf = (path: string): string | null => row(path).querySelector("svg")?.getAttribute("data-icon-token") ?? null;
		expect(tokenOf(NESTED)).toBe("react");
		expect(tokenOf(SHALLOW)).toBe("typescript");
		expect(tokenOf(NESTED)).not.toBe(tokenOf(SHALLOW));
	});

	it("keeps the file list visible without a collapse control", async () => {
		const { row } = setup();

		// 列表常驻：没有任何「隐藏/显示文件列表」的开关。
		expect(screen.queryByTitle("action.hideList")).toBeNull();
		expect(screen.queryByTitle("action.showList")).toBeNull();
		fireEvent.click(row(SHALLOW));
		// 点选后列表仍在原处生效（选中态落在行上，而不是被收起）。
		expect(row(SHALLOW).className.split(" ")).toContain("bg-accent");
		expect(row(NESTED).className.split(" ")).not.toContain("bg-accent");
	});


	it("lets the lower section grow by dragging the divider", async () => {
		setup(MIXED);

		// 两个分区（展开）之间才会有一个可拖手柄。
		const handle = await screen.findByTitle("section.resize");
		const staged = handle.parentElement as HTMLElement;
		const unstaged = staged.nextElementSibling as HTMLElement;
		const weightOf = (el: HTMLElement): number => Number.parseFloat(el.style.flex.split(" ")[0] ?? "0");
		const before = { staged: weightOf(staged), unstaged: weightOf(unstaged) };

		// 向上拖：上方分区让出高度，下方分区变高（权重按 px 换算）。
		drag(handle, 300, 180);

		await waitFor(() => expect(weightOf(staged)).toBeLessThan(before.staged));
		expect(weightOf(unstaged)).toBeGreaterThan(before.unstaged);
		// 上下两边的总权重不变，容器变高变矮时比例仍然成立。
		expect(weightOf(staged) + weightOf(unstaged)).toBeCloseTo(before.staged + before.unstaged, 5);
	});

	it("stops shrinking a section at its usable minimum", async () => {
		setup(MIXED);

		const handle = await screen.findByTitle("section.resize");
		const staged = handle.parentElement as HTMLElement;
		const unstaged = staged.nextElementSibling as HTMLElement;
		const weightOf = (el: HTMLElement): number => Number.parseFloat(el.style.flex.split(" ")[0] ?? "0");

		// 向上拖一个远超可用空间的距离：上方分区不许被拖没，停在最小可用高度。
		drag(handle, 300, -100000);

		const total = weightOf(staged) + weightOf(unstaged);
		const pxPerWeight = 600 / total;
		await waitFor(() => expect(weightOf(staged) * pxPerWeight).toBeGreaterThanOrEqual(76));
	});

	it("shows the selected file's full path under its name in the diff header", async () => {
		const { container, row, run } = setup();

		// 拉宽后默认选中第一个改动文件，路径行随即可读。
		const pathLine = await screen.findByText(NESTED);
		expect(pathLine.className).toContain("text-muted-foreground");
		// 文件名在列表里也有一份，这里只取详情头部那一个：它和路径同属一列。
		const headerColumn = pathLine.parentElement as HTMLElement;
		const nameLine = headerColumn.querySelector("span") as HTMLElement;
		expect(nameLine.textContent).toBe("GitChanges.tsx");
		// 「标题下方」是结构要求：路径必须在文件名之后（同一列内往下）。
		expect(nameLine.compareDocumentPosition(pathLine) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(container.querySelector("diffs-container")?.shadowRoot?.textContent).toContain(NESTED);

		fireEvent.click(row(SHALLOW));
		await waitFor(() => expect(run.mock.calls.some(([, args]) => args?.at(-1) === SHALLOW)).toBe(true));
		expect(await screen.findByText(SHALLOW)).toBeTruthy();
		expect(screen.queryByText(NESTED)).toBeNull();
		await waitFor(() =>
			expect(container.querySelector("diffs-container")?.shadowRoot?.textContent).toContain(SHALLOW),
		);
	});
});
