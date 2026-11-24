// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {
	CommandMenuGroupView,
	CommandMenuItemView,
	CommandMenuViewProps,
} from "@vetta-org/theme-ui/overlays";
import { CommandMenuView } from "@vetta-org/theme-ui/overlays";
import { describe, expect, it, vi } from "vitest";

const labels = {
	placeholder: "Search projects, sessions, settings…",
	empty: "No results",
	emptyHint: "Try a different keyword",
	loading: "Searching sessions",
	title: "Command Menu",
	actionsLabel: "Actions",
	newSession: "New session",
	hintSelect: "Open",
	hintClose: "Close",
};

function item(overrides: Partial<CommandMenuItemView> = {}): CommandMenuItemView {
	return {
		id: "project:demo",
		title: "demo",
		titleHighlights: [],
		icon: "icon-[solar--folder-linear]",
		...overrides,
	};
}

function props(overrides: Partial<CommandMenuViewProps> = {}): CommandMenuViewProps {
	return {
		open: true,
		query: "",
		groups: [],
		selectedId: null,
		labels,
		suppressSelectionAnimation: false,
		onQueryChange: vi.fn(),
		onHoverItem: vi.fn(),
		onActivateItem: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	};
}

function group(overrides: Partial<CommandMenuGroupView> = {}): CommandMenuGroupView {
	return { key: "projects", label: "Projects", items: [item()], ...overrides };
}

describe("CommandMenuView", () => {
	it("renders nothing while closed and mounts the dialog once opened", () => {
		const { rerender } = render(<CommandMenuView {...props({ open: false })} />);
		expect(screen.queryByRole("dialog")).toBeNull();

		rerender(<CommandMenuView {...props({ open: true })} />);
		expect(screen.getByRole("dialog", { name: "Command Menu" })).toBeTruthy();
	});

	it("keeps the fixed group order regardless of how many results each group has", () => {
		const groups = [
			group({ key: "projects", label: "Projects", items: [item({ id: "p1", title: "alpha" })] }),
			group({
				key: "sessions",
				label: "Sessions",
				items: [
					item({ id: "s1", title: "beta" }),
					item({ id: "s2", title: "gamma" }),
					item({ id: "s3", title: "delta" }),
				],
			}),
			group({ key: "settings", label: "Settings", items: [item({ id: "st1", title: "Language" })] }),
		];
		render(<CommandMenuView {...props({ groups })} />);

		const rendered = within(screen.getByRole("listbox")).getAllByRole("group").map((node) => node.getAttribute("aria-label"));
		expect(rendered).toEqual(["Projects", "Sessions", "Settings"]);
	});

	it("hides empty groups but keeps a loading group visible with a skeleton placeholder", () => {
		const groups = [
			group({ key: "projects", label: "Projects", items: [] }),
			group({ key: "sessions", label: "Sessions", items: [], loading: true }),
		];
		render(<CommandMenuView {...props({ groups, query: "abc" })} />);

		expect(screen.queryByRole("group", { name: "Projects" })).toBeNull();
		const sessions = screen.getByRole("group", { name: "Sessions" });
		expect(within(sessions).getByLabelText("Searching sessions")).toBeTruthy();
		// 骨架在场时不算“无结果”，否则会在异步结果到达前闪一次空态。
		expect(screen.queryByText("No results")).toBeNull();
	});

	it("shows the empty state only when nothing is pending", () => {
		render(<CommandMenuView {...props({ query: "zzz", groups: [] })} />);
		expect(screen.getByText("No results")).toBeTruthy();
		expect(screen.getByText("Try a different keyword")).toBeTruthy();
	});

	it("renders the per-group overflow label when results are capped", () => {
		const groups = [group({ overflowLabel: "12 more" })];
		render(<CommandMenuView {...props({ groups })} />);
		expect(screen.getByText("12 more")).toBeTruthy();
	});

	it("marks the selected row and links it to the input for assistive tech", () => {
		const groups = [
			group({ items: [item({ id: "p1", title: "alpha" }), item({ id: "p2", title: "beta" })] }),
		];
		render(<CommandMenuView {...props({ groups, selectedId: "p2" })} />);

		const options = screen.getAllByRole("option");
		expect(options.map((node) => node.getAttribute("aria-selected"))).toEqual(["false", "true"]);
		expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe("command-menu-item-p2");
	});

	it("renders unavailable rows as disabled with their reason instead of dropping them", async () => {
		const onActivateItem = vi.fn();
		const groups = [
			group({
				items: [item({ id: "s1", title: "locked", disabled: true, disabledReason: "No access" })],
			}),
		];
		render(<CommandMenuView {...props({ groups, onActivateItem })} />);

		const option = screen.getByRole("option", { name: /locked/ });
		expect(option.getAttribute("aria-disabled")).toBe("true");
		expect(option.getAttribute("title")).toBe("No access");
		await userEvent.click(option);
		expect(onActivateItem).not.toHaveBeenCalled();
	});

	it("splits the title into highlighted and plain segments from the given ranges", () => {
		const groups = [
			group({
				items: [
					item({ id: "p1", title: "openvetta", titleHighlights: [{ start: 4, end: 9 }] }),
				],
			}),
		];
		const { baseElement: container } = render(<CommandMenuView {...props({ groups })} />);

		const hits = Array.from(container.querySelectorAll(".text-primary")).map((node) => node.textContent);
		expect(hits).toContain("vetta");
		// 拆成多个 span 后可访问名会被插入空格，故按原始文本断言拼接无损。
		expect(screen.getByRole("option").textContent).toBe("openvetta");
	});

	it("lets a long subtitle give way instead of squeezing the title", () => {
		const groups = [
			group({
				items: [
					item({
						id: "a1",
						title: "vetta-testing",
						subtitle: "为 OpenVetta 的功能变更、Bug 修复、重构、公共合同和 UI 交互设计、编写或审查测试",
					}),
				],
			}),
		];
		const { baseElement: container } = render(<CommandMenuView {...props({ groups })} />);

		const [title, subtitle] = Array.from(container.querySelectorAll("[role='option'] > span > span"));
		// 标题不收缩、只受上限约束；副标题吃掉剩余宽度并自己截断。
		expect(title.className).toContain("shrink-0");
		expect(title.className).toContain("max-w-[60%]");
		expect(subtitle.className).toContain("flex-1");
		expect(subtitle.className).toContain("min-w-0");
	});

	it("activates a row on click and reports hover for selection follow", async () => {
		const onActivateItem = vi.fn();
		const onHoverItem = vi.fn();
		const groups = [group({ items: [item({ id: "p1", title: "alpha" })] })];
		render(<CommandMenuView {...props({ groups, onActivateItem, onHoverItem })} />);

		await userEvent.click(screen.getByRole("option", { name: /alpha/ }));
		expect(onActivateItem).toHaveBeenCalledWith("p1");
		expect(onHoverItem).toHaveBeenCalledWith("p1");
	});

	it("closes when the backdrop is pressed but not when the panel itself is", async () => {
		const onClose = vi.fn();
		const groups = [group()];
		render(<CommandMenuView {...props({ groups, onClose })} />);

		await userEvent.click(screen.getByRole("dialog"));
		expect(onClose).not.toHaveBeenCalled();

		const backdrop = screen.getByRole("dialog").parentElement as HTMLElement;
		await userEvent.click(backdrop);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("reports typing through onQueryChange without owning the value", async () => {
		const onQueryChange = vi.fn();
		render(<CommandMenuView {...props({ onQueryChange })} />);

		await userEvent.type(screen.getByRole("combobox"), "g");
		expect(onQueryChange).toHaveBeenCalledWith("g");
		expect(screen.getByRole("combobox").getAttribute("value")).toBe("");
	});

	it("shows the toggle shortcut and keycap hints, and marks in-progress sessions", () => {
		const groups = [
			group({
				key: "activeSessions",
				label: "In progress",
				items: [item({ id: "s1", title: "deploy", status: "waiting", statusLabel: "Waiting", badge: "vetta" })],
			}),
			group({ key: "abilities", label: "Abilities", items: [item({ id: "a1", title: "PDF", badge: "Skill", badgeTone: "accent" })] }),
		];
		render(<CommandMenuView {...props({ groups, toggleShortcut: "mod+t" })} />);

		const dialog = screen.getByRole("dialog");
		expect(dialog.textContent).toContain("T");
		const actions = screen.getByRole("group", { name: "Actions" });
		expect(within(actions).getByRole("button", { name: /Open/ })).toBeTruthy();
		expect(within(actions).getByRole("button", { name: /Close/ })).toBeTruthy();
		const session = screen.getByRole("option", { name: /deploy/ });
		expect(within(session).getByText("Waiting")).toBeTruthy();
		expect(within(session).getByText("vetta")).toBeTruthy();
		expect(session.querySelector("[data-session-waiting='true']")).not.toBeNull();
		expect(within(screen.getByRole("option", { name: /PDF/ })).getByText("Skill").className).toContain("text-primary");
	});

	it("opens, closes and starts a new session from the bottom button groups", async () => {
		// 纯展示组件的唯一输出就是回调：按发生顺序记下用户意图，再断言整段序列。
		const intents: string[] = [];
		render(
			<CommandMenuView
				{...props({
					groups: [group()],
					selectedId: "project:demo",
					onActivateItem: (id) => intents.push(`open:${id}`),
					onClose: () => intents.push("close"),
					onNewSession: () => intents.push("new-session"),
					newSessionShortcut: "mod+n",
				})}
			/>,
		);
		const actions = screen.getByRole("group", { name: "Actions" });

		await userEvent.click(within(actions).getByRole("button", { name: /Open/ }));
		await userEvent.click(within(actions).getByRole("button", { name: /Close/ }));
		await userEvent.click(screen.getByRole("button", { name: /New session/ }));
		expect(intents).toEqual(["open:project:demo", "close", "new-session"]);
	});

	it("disables the open action when nothing is selected", () => {
		render(<CommandMenuView {...props({ groups: [], selectedId: null })} />);
		const open = within(screen.getByRole("group", { name: "Actions" })).getByRole("button", { name: /Open/ });
		expect((open as HTMLButtonElement).disabled).toBe(true);
	});

	it("scrolls the row chosen by keyboard into view but leaves a hovered row where the pointer is", () => {
		// 记下每次被滚进视野的是哪一行，断言列表最终露出的行，而不是数调用次数。
		const scrolled: Array<{ row: string | null; options: unknown }> = [];
		const original = HTMLElement.prototype.scrollIntoView;
		HTMLElement.prototype.scrollIntoView = function (this: HTMLElement, options?: unknown) {
			scrolled.push({ row: this.textContent, options });
		};
		try {
			const groups = [
				group({
					items: [item({ id: "a", title: "alpha" }), item({ id: "b", title: "beta" }), item({ id: "c", title: "gamma" })],
				}),
			];
			// 宿主把悬停回调落到 selectedId 上，模拟真实 model 的行为。
			let current = "a";
			const onHoverItem = (id: string) => {
				current = id;
			};
			const { rerender } = render(<CommandMenuView {...props({ groups, selectedId: "a", onHoverItem })} />);
			scrolled.length = 0;

			// 键盘下移：选中项变化来自宿主，没有指针参与 → 跟随滚动。
			current = "b";
			rerender(<CommandMenuView {...props({ groups, selectedId: current, onHoverItem })} />);
			expect(scrolled).toHaveLength(1);
			expect(scrolled[0]?.row).toContain("beta");
			expect(scrolled[0]?.options).toEqual({ block: "nearest" });

			// 指针移到另一行：选中项跟着变，但不应滚动。
			scrolled.length = 0;
			const gamma = screen.getByRole("option", { name: /gamma/ });
			gamma.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			expect(current).toBe("c");
			rerender(<CommandMenuView {...props({ groups, selectedId: current, onHoverItem })} />);
			expect(scrolled).toEqual([]);

			// 指针停在已选中的行上反复 mousemove，不能吞掉之后的键盘跟随。
			gamma.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
			rerender(<CommandMenuView {...props({ groups, selectedId: "a", onHoverItem })} />);
			expect(scrolled).toHaveLength(1);
			expect(scrolled[0]?.row).toContain("alpha");
		} finally {
			HTMLElement.prototype.scrollIntoView = original;
		}
	});
});
