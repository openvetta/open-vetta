// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
	type ModelSelectorFavorites,
	type ModelSelectorLabels,
	type ModelSelectorOptionView,
	type ModelSelectorProviderGroup,
	ModelSelectorView,
} from "@vetta-org/theme-ui/chat/ModelSelectorView";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const labels: ModelSelectorLabels = {
	placeholder: "Choose model",
	searchPlaceholder: "Search models",
	clearSearch: "Clear search",
	noResults: "No models",
	noResultsHint: "Try another query",
	reasoningHeader: "Reasoning",
	modelHeader: "Models",
	cloudOnly: "Cloud",
	visionBadge: "Supports image input",
	defaultBadge: "Default",
	levelLabel: (value) => `level:${value}`,
};

const favoriteLabels: ModelSelectorFavorites["labels"] = {
	tab: "Favorites",
	empty: "No favorites yet",
	add: "Add to favorites",
	remove: "Remove from favorites",
};

function makeGroup(provider: string, label: string, count: number): ModelSelectorProviderGroup {
	const models: ModelSelectorOptionView[] = Array.from({ length: count }, (_, index) => ({
		key: `${provider}/m${index}`,
		provider,
		modelId: `m${index}`,
		displayName: `${label} Model ${index}`,
	}));
	return { provider, label, models };
}

// jsdom 没有布局，滚动容器量出来是 0 高，虚拟列表就一行都不画；给元素一个像真实布局的尺寸。
const originalClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
const originalClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
beforeAll(() => {
	Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
	Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 256 });
});
afterAll(() => {
	if (originalClientHeight) Object.defineProperty(HTMLElement.prototype, "clientHeight", originalClientHeight);
	if (originalClientWidth) Object.defineProperty(HTMLElement.prototype, "clientWidth", originalClientWidth);
});

const groups = [makeGroup("alpha", "Alpha", 3), makeGroup("magpie", "Magpie", 120)];
const hugeGroups = [makeGroup("alpha", "Alpha", 3), makeGroup("magpie", "Magpie", 500)];

function baseProps(overrides: Partial<Parameters<typeof ModelSelectorView>[0]> = {}): Parameters<typeof ModelSelectorView>[0] {
	const selected = groups[0]?.models[0] ?? null;
	return {
		selectedModel: selected?.key,
		selectedOption: selected,
		menuLevels: [],
		groups,
		labels,
		onModelSelect: vi.fn(),
		onReasoningSelect: vi.fn(),
		...overrides,
	};
}

function renderView(overrides: Partial<Parameters<typeof ModelSelectorView>[0]> = {}) {
	return render(<ModelSelectorView {...baseProps(overrides)} />);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));
}

describe("ModelSelectorView 三栏布局", () => {
	beforeAll(() => {
		// jsdom 没有实现 scrollIntoView；视图打开时会把选中项滚入可视区。
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("第二栏只列当前供应商的模型，点第一栏切换供应商，菜单保持打开", async () => {
		const user = userEvent.setup();
		renderView();
		await openMenu(user);

		expect(screen.getByRole("menuitem", { name: "Alpha Model 1" })).toBeTruthy();
		expect(screen.queryByText("Magpie Model 0")).toBeNull();

		await user.click(screen.getByRole("menuitem", { name: "Magpie" }));
		expect(screen.getByRole("menuitem", { name: "Magpie Model 0" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Alpha Model 1" })).toBeNull();
	});

	it("没有图标的供应商用名称首字做头像", async () => {
		const user = userEvent.setup();
		renderView();
		await openMenu(user);

		expect(screen.getByRole("menuitem", { name: "Magpie" }).textContent).toBe("M");
	});

	it("搜索跨所有供应商，选中结果后清空搜索并落到该模型的供应商", async () => {
		const user = userEvent.setup();
		const onModelSelect = vi.fn();
		renderView({ onModelSelect });
		await openMenu(user);
		await user.type(screen.getByPlaceholderText("Search models"), "Magpie Model 7");
		await user.click(screen.getByRole("menuitem", { name: "Magpie Model 7" }));

		expect(onModelSelect).toHaveBeenCalledWith("magpie/m7");
	});

	it("只有一个供应商且没有收藏功能时不出现第一栏", async () => {
		const user = userEvent.setup();
		renderView({ groups: [makeGroup("alpha", "Alpha", 3)] });
		await openMenu(user);

		expect(screen.queryByRole("menuitem", { name: "Alpha" })).toBeNull();
		expect(screen.getByRole("menuitem", { name: "Alpha Model 2" })).toBeTruthy();
	});

	it("所选模型有推理档位时显示第三栏，选档位后关闭菜单", async () => {
		const user = userEvent.setup();
		const onReasoningSelect = vi.fn();
		renderView({ menuLevels: ["off", "high"], currentLevel: "high", onReasoningSelect });
		await openMenu(user);

		await user.click(screen.getByRole("menuitem", { name: "level:off" }));
		expect(onReasoningSelect).toHaveBeenCalledWith("off");
		await waitFor(() => expect(screen.queryByPlaceholderText("Search models")).toBeNull());
	});

	it("选中带推理档位的模型后保持打开，其它模型仍然直接关闭", async () => {
		const user = userEvent.setup();
		const onModelSelect = vi.fn();
		renderView({ onModelSelect, reasoningModelKeys: new Set(["alpha/m1"]) });
		await openMenu(user);

		await user.click(screen.getByRole("menuitem", { name: "Alpha Model 1" }));
		expect(onModelSelect).toHaveBeenCalledWith("alpha/m1");
		expect(screen.getByPlaceholderText("Search models")).toBeTruthy();

		await user.click(screen.getByRole("menuitem", { name: "Alpha Model 2" }));
		await waitFor(() => expect(screen.queryByPlaceholderText("Search models")).toBeNull());
	});
});

describe("ModelSelectorView 大列表", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("供应商有几百个模型时只挂载窗口内的行，而不是全部", async () => {
		const user = userEvent.setup();
		renderView({ groups: hugeGroups });
		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Magpie" }));

		const rows = screen.getAllByRole("menuitem").filter((item) => item.hasAttribute("data-model-key"));
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.length).toBeLessThan(60);
		expect(screen.getByRole("menuitem", { name: "Magpie Model 0" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Magpie Model 499" })).toBeNull();
	});

	it("虚拟列表里的行仍可选中", async () => {
		const user = userEvent.setup();
		const onModelSelect = vi.fn();
		renderView({ groups: hugeGroups, onModelSelect });
		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Magpie" }));
		await user.click(screen.getByRole("menuitem", { name: "Magpie Model 2" }));

		expect(onModelSelect).toHaveBeenCalledWith("magpie/m2");
	});

	it("搜索能在整个大列表里命中窗口之外的模型", async () => {
		const user = userEvent.setup();
		renderView({ groups: hugeGroups });
		await openMenu(user);
		await user.type(screen.getByPlaceholderText("Search models"), "Magpie Model 499");

		expect(screen.getByRole("menuitem", { name: "Magpie Model 499" })).toBeTruthy();
	});
});

describe("ModelSelectorView 服务商过多时折叠第一栏", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	const manyProviders = Array.from({ length: 14 }, (_, index) => makeGroup(`p${index}`, `Prov${index}`, 2));
	const foldLabels = {
		...labels,
		moreProviders: (count: number) => `${count} more`,
		fewerProviders: "Fewer",
	};

	function renderMany(selectedIndex: number) {
		const selected = manyProviders[selectedIndex]?.models[0] ?? null;
		return renderView({
			groups: manyProviders,
			labels: foldLabels,
			selectedModel: selected?.key,
			selectedOption: selected,
		});
	}

	it("只露前 8 个服务商，其余收进「更多」，点开后全部列出并可再收起", async () => {
		const user = userEvent.setup();
		renderMany(0);
		await user.click(screen.getByRole("button", { name: /Prov0 Model 0/ }));

		expect(screen.getByRole("menuitem", { name: "Prov7" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Prov8" })).toBeNull();

		await user.click(screen.getByRole("menuitem", { name: "6 more" }));
		expect(screen.getByRole("menuitem", { name: "Prov13" })).toBeTruthy();

		await user.click(screen.getByRole("menuitem", { name: "Fewer" }));
		expect(screen.queryByRole("menuitem", { name: "Prov13" })).toBeNull();
	});

	it("所选模型的服务商排在折叠区里也始终露出", async () => {
		const user = userEvent.setup();
		renderMany(12);
		await user.click(screen.getByRole("button", { name: /Prov12 Model 0/ }));

		expect(screen.getByRole("menuitem", { name: "Prov12" })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: "Prov11" })).toBeNull();
		expect(screen.getByRole("menuitem", { name: "5 more" })).toBeTruthy();
	});

	it("宿主没提供折叠文案时第一栏全部列出", async () => {
		const user = userEvent.setup();
		renderView({ groups: manyProviders, selectedModel: "p0/m0", selectedOption: manyProviders[0]?.models[0] ?? null });
		await user.click(screen.getByRole("button", { name: /Prov0 Model 0/ }));

		expect(screen.getByRole("menuitem", { name: "Prov13" })).toBeTruthy();
	});
});

describe("ModelSelectorView 底栏与受控开合", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("传了 footerStart / footerEnd 就在底部渲染，没传就没有底栏", async () => {
		const user = userEvent.setup();
		const { unmount } = renderView({
			footerStart: <span>hint-left</span>,
			footerEnd: <button type="button">sandbox-right</button>,
		});
		await openMenu(user);
		expect(screen.getByText("hint-left")).toBeTruthy();
		expect(screen.getByRole("button", { name: "sandbox-right" })).toBeTruthy();
		unmount();

		renderView();
		await openMenu(user);
		expect(screen.queryByText("hint-left")).toBeNull();
	});

	it("面板是毛玻璃材质：半透明底色加背景模糊", async () => {
		const user = userEvent.setup();
		renderView();
		await openMenu(user);

		const content = document.querySelector('[data-slot="dropdown-menu-content"]') as HTMLElement;
		expect(content.className).toContain("bg-background/70");
		expect(content.className).toContain("backdrop-blur-xl");
	});

	it("受控 open：宿主设为 true 就打开，设回 false 就关闭并清掉搜索词", async () => {
		const user = userEvent.setup();
		const { rerender } = renderView({ open: false });
		expect(screen.queryByPlaceholderText("Search models")).toBeNull();

		rerender(<ModelSelectorView {...baseProps()} open />);
		const search = await screen.findByPlaceholderText("Search models");
		await user.type(search, "zzz");

		rerender(<ModelSelectorView {...baseProps()} open={false} />);
		await waitFor(() => expect(screen.queryByPlaceholderText("Search models")).toBeNull());

		rerender(<ModelSelectorView {...baseProps()} open />);
		expect((await screen.findByPlaceholderText("Search models")) as HTMLInputElement).toHaveProperty("value", "");
	});

	it("搜索框里带 Cmd/Ctrl 的按键不会被拦截，保证全局快捷键还能再按一次收起菜单", async () => {
		const user = userEvent.setup();
		renderView();
		await openMenu(user);
		const search = screen.getByPlaceholderText("Search models");
		const reachedWindow = vi.fn();
		window.addEventListener("keydown", reachedWindow);

		fireEvent.keyDown(search, { key: "p", metaKey: true });
		expect(reachedWindow).toHaveBeenCalledTimes(1);
		fireEvent.keyDown(search, { key: "p" });
		expect(reachedWindow).toHaveBeenCalledTimes(1);

		window.removeEventListener("keydown", reachedWindow);
	});
});

describe("ModelSelectorView 收藏", () => {
	beforeAll(() => {
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("点星标收藏而不选中模型，菜单保持打开", async () => {
		const user = userEvent.setup();
		const onToggle = vi.fn();
		const onModelSelect = vi.fn();
		renderView({ onModelSelect, favorites: { keys: new Set(), onToggle, labels: favoriteLabels } });
		await openMenu(user);

		const stars = screen.getAllByRole("button", { name: "Add to favorites" });
		await user.click(stars[1] as HTMLElement);

		expect(onToggle).toHaveBeenCalledWith("alpha/m1");
		expect(onModelSelect).not.toHaveBeenCalled();
		expect(screen.getByPlaceholderText("Search models")).toBeTruthy();
	});

	it("未收藏的星标平时不占位、悬停才出现；已收藏的常显，且排在右侧其它图标之前", async () => {
		const user = userEvent.setup();
		const selected = { ...makeGroup("alpha", "Alpha", 3).models[0]!, supportsImage: true };
		const withVision: ModelSelectorProviderGroup[] = [
			{ provider: "alpha", label: "Alpha", models: [selected, ...makeGroup("alpha", "Alpha", 3).models.slice(1)] },
			makeGroup("magpie", "Magpie", 2),
		];
		renderView({
			groups: withVision,
			selectedModel: selected.key,
			selectedOption: selected,
			favorites: { keys: new Set([selected.key]), onToggle: vi.fn(), labels: favoriteLabels },
		});
		await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));

		const idle = screen.getAllByRole("button", { name: "Add to favorites" })[0] as HTMLElement;
		expect(idle.className).toContain("hidden");
		expect(idle.className).toContain("group-hover:inline-flex");

		const pinned = screen.getByRole("button", { name: "Remove from favorites" });
		expect(pinned.className).not.toContain("hidden");
		const icons = Array.from(pinned.closest('[role="menuitem"]')?.children ?? []);
		const vision = icons.findIndex((node) => node.getAttribute("aria-label") === labels.visionBadge);
		expect(icons.indexOf(pinned)).toBeGreaterThan(0);
		expect(icons.indexOf(pinned)).toBeLessThan(vision);
	});

	it("「收藏」入口按供应商分组列出收藏的模型，没有收藏时给出提示", async () => {
		const user = userEvent.setup();
		const favorites = { keys: new Set(["magpie/m5"]), onToggle: vi.fn(), labels: favoriteLabels };
		const { unmount } = renderView({ favorites });
		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Favorites" }));

		expect(screen.getByRole("menuitem", { name: /Magpie Model 5/ })).toBeTruthy();
		expect(screen.queryByRole("menuitem", { name: /Alpha Model 1/ })).toBeNull();
		expect(screen.getByText("Favorites")).toBeTruthy();
		unmount();

		renderView({ favorites: { ...favorites, keys: new Set() } });
		await openMenu(user);
		await user.click(screen.getByRole("menuitem", { name: "Favorites" }));
		expect(screen.getByText("No favorites yet")).toBeTruthy();
		// 空态只留一句提示，不再显示列表标题。
		expect(screen.queryByText("Favorites")).toBeNull();
	});

	it("宿主不接收藏时不出现星标和「收藏」入口", async () => {
		const user = userEvent.setup();
		renderView();
		await openMenu(user);

		expect(screen.queryByRole("button", { name: "Add to favorites" })).toBeNull();
		expect(screen.queryByRole("menuitem", { name: "Favorites" })).toBeNull();
	});
});
