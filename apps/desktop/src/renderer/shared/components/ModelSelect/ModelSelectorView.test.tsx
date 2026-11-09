// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	type ModelSelectorLabels,
	type ModelSelectorOptionView,
	type ModelSelectorProviderGroup,
	ModelSelectorView,
} from "@vetta-org/theme-ui/chat/ModelSelectorView";

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
	levelLabel: (value) => value,
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

const groups = [makeGroup("alpha", "Alpha", 3), makeGroup("magpie", "Magpie", 120)];

function renderView(overrides: Partial<Parameters<typeof ModelSelectorView>[0]> = {}) {
	const selected = groups[0]?.models[0] ?? null;
	return render(
		<ModelSelectorView
			selectedModel={selected?.key}
			selectedOption={selected}
			menuLevels={[]}
			groups={groups}
			labels={labels}
			onModelSelect={vi.fn()}
			onReasoningSelect={vi.fn()}
			{...overrides}
		/>,
	);
}

describe("ModelSelectorView 分组折叠", () => {
	beforeAll(() => {
		// jsdom 没有实现 scrollIntoView；视图打开时会把选中项滚入可视区。
		Element.prototype.scrollIntoView = vi.fn();
	});

	it("打开时只展开选中模型所在的分组，其余分组折叠并显示数量", async () => {
		const user = userEvent.setup();
		renderView();
		await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));

		expect(screen.getByText("Alpha Model 1")).toBeTruthy();
		expect(screen.queryByText("Magpie Model 0")).toBeNull();
		expect(screen.getByText("120")).toBeTruthy();
	});

	it("点击折叠的分组头展开它，菜单保持打开", async () => {
		const user = userEvent.setup();
		renderView();
		await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));
		await user.click(screen.getByText("Magpie"));

		expect(screen.getByText("Magpie Model 0")).toBeTruthy();
		expect(screen.getByText("Alpha Model 1")).toBeTruthy();
	});

	it("搜索时命中的分组一律展开，清空搜索后恢复折叠", async () => {
		const user = userEvent.setup();
		renderView();
		await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));
		await user.type(screen.getByPlaceholderText("Search models"), "Magpie Model 7");

		expect(screen.getByText("Magpie Model 7")).toBeTruthy();

		await user.clear(screen.getByPlaceholderText("Search models"));
		expect(screen.queryByText("Magpie Model 7")).toBeNull();
	});

	it("只有一个分组时不出现折叠控件", async () => {
		const user = userEvent.setup();
		renderView({ groups: [makeGroup("alpha", "Alpha", 3)] });
		await user.click(screen.getByRole("button", { name: /Alpha Model 0/ }));

		expect(screen.getByText("Alpha Model 2")).toBeTruthy();
		expect(screen.getAllByRole("menuitem").every((item) => !item.hasAttribute("aria-expanded"))).toBe(true);
	});
});
