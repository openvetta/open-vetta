// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchBar } from "../src/components/BranchBar";
import { setGitCommand } from "../src/git/runtime";

vi.mock("@vetta-org/plugin-sdk", () => ({
	useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
}));

/**
 * 宿主的 Select / Dialog 用窄替身：下拉换成「按钮点击即选中」，对话框按 open 直出内容。
 * 这样测试覆盖的是本插件「选中值 → 切分支 / 开新建对话框」的接线，而不依赖 Radix 的
 * 指针事件（jsdom 里跑不稳）。
 */
vi.mock("@vetta-org/ui", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/ui")>();
	const { createContext, useContext } = await import("react");
	const SelectContext = createContext<(value: string) => void>(() => {});
	const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
	return {
		...actual,
		Select: ({
			value,
			onValueChange,
			disabled,
			children,
		}: {
			value?: string;
			onValueChange?: (value: string) => void;
			disabled?: boolean;
			children?: ReactNode;
		}) => (
			<div data-testid="branch-select" data-value={value ?? ""} data-disabled={disabled ? "true" : "false"}>
				<SelectContext.Provider value={(next) => onValueChange?.(next)}>{children}</SelectContext.Provider>
			</div>
		),
		SelectTrigger: passthrough,
		SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
		SelectContent: passthrough,
		SelectGroup: passthrough,
		SelectLabel: passthrough,
		SelectSeparator: () => null,
		SelectItem: ({ value, disabled, children }: { value: string; disabled?: boolean; children?: ReactNode }) => {
			const select = useContext(SelectContext);
			return (
				<button type="button" disabled={disabled} onClick={() => select(value)}>
					{children}
				</button>
			);
		},
		Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
		DialogContent: passthrough,
		DialogHeader: passthrough,
		DialogTitle: passthrough,
		DialogDescription: passthrough,
		DialogFooter: passthrough,
	};
});

const HASH = "a".repeat(40);

function setup() {
	const calls: string[][] = [];
	setGitCommand({
		run: async (_file: string, args: string[] = []) => {
			calls.push(args);
			if (args[0] === "branch" && args.includes("--show-current")) return { exitCode: 0, stdout: "dev\n", stderr: "" };
			if (args[0] === "branch" && args.includes("-r")) return { exitCode: 0, stdout: `origin/main ${HASH}\n`, stderr: "" };
			if (args[0] === "branch") return { exitCode: 0, stdout: `dev ${HASH}\nmain ${HASH}\n`, stderr: "" };
			return { exitCode: 0, stdout: "", stderr: "" };
		},
	});
	render(<BranchBar root="/repo" />);
	return { calls };
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("branch switcher", () => {
	it("shows the current branch and both scopes in the host Select", async () => {
		setup();

		const select = await screen.findByTestId("branch-select");
		await waitFor(() => expect(select.getAttribute("data-value")).toBe("local:dev"));
		// 当前分支不可再选（免得无意义地 checkout 到自己）。
		expect(screen.getByRole("button", { name: "dev" })).toHaveProperty("disabled", true);
		expect(screen.getByRole("button", { name: "main" })).toHaveProperty("disabled", false);
		expect(screen.getByText("branch.scopeLocal")).toBeTruthy();
		expect(screen.getByText("branch.scopeRemote")).toBeTruthy();
		expect(screen.getByText("origin/main")).toBeTruthy();
	});

	it("falls back to the branch name when the repository has no commits yet", async () => {
		setGitCommand({
			run: async (_file: string, args: string[] = []) => {
				if (args[0] === "branch" && args.includes("--show-current")) return { exitCode: 0, stdout: "main\n", stderr: "" };
				return { exitCode: 0, stdout: "", stderr: "" };
			},
		});
		render(<BranchBar root="/repo" />);

		// 空仓库：git 报得出分支名，但一条分支也列不出来，触发器得靠 placeholder 显示名字。
		const select = await screen.findByTestId("branch-select");
		await waitFor(() => expect(screen.getByText("main")).toBeTruthy());
		expect(select.getAttribute("data-value")).toBe("");
	});

	it("checks out the picked branch and refreshes", async () => {
		const { calls } = setup();

		fireEvent.click(await screen.findByRole("button", { name: "main" }));
		await waitFor(() => expect(calls.some((args) => args[0] === "checkout" && args[1] === "main")).toBe(true));
		const branchReads = (): number => calls.filter((args) => args[0] === "branch" && args.includes("--show-current")).length;
		await waitFor(() => expect(branchReads()).toBeGreaterThan(1));
	});

	it("creates a branch from the same dropdown entry", async () => {
		const { calls } = setup();

		fireEvent.click(await screen.findByRole("button", { name: "branch.create" }));
		const input = await screen.findByPlaceholderText("branch.namePlaceholder");
		fireEvent.change(input, { target: { value: "feature/x" } });
		fireEvent.click(screen.getByRole("button", { name: "branch.createConfirm" }));

		await waitFor(() =>
			expect(calls.some((args) => args[0] === "checkout" && args[1] === "-b" && args[2] === "feature/x")).toBe(true),
		);
		expect(screen.queryByPlaceholderText("branch.namePlaceholder")).toBeNull();
	});
});
