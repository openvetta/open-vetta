// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InlineModelPicker } from "./index";
import type { ModelSelectorLabels, ModelSelectorProviderGroup } from "./ModelSelectorView";

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

const groups: readonly ModelSelectorProviderGroup[] = [
	{
		provider: "provider",
		label: "Provider",
		models: [
			{
				key: "provider/vision",
				provider: "provider",
				modelId: "vision",
				displayName: "Image Model",
				supportsImage: true,
			},
			{
				key: "provider/plain",
				provider: "provider",
				modelId: "plain",
				displayName: "Plain Model",
				supportsImage: false,
			},
		],
	},
];

describe("InlineModelPicker", () => {
	it("renders vision capability as a role=img icon, does not render for unsupported models, and displays no text badge", () => {
		const container = document.createElement("div");
		container.innerHTML = renderToStaticMarkup(
			<InlineModelPicker
				title="Select model"
				description="Choose a model"
				backLabel="Back"
				onBack={vi.fn()}
				groups={groups}
				labels={labels}
				disabled={false}
				onModelSelect={vi.fn()}
			/>,
		);

		const buttons = Array.from(container.querySelectorAll("button"));
		const visionItem = buttons.find((button) => button.textContent?.includes("Image Model"));
		const plainItem = buttons.find((button) => button.textContent?.includes("Plain Model"));

		expect(visionItem).toBeDefined();
		expect(plainItem).toBeDefined();

		// 支持图片的模型显示 role=img 的识图图标
		const visionIcon = visionItem?.querySelector('[role="img"]');
		expect(visionIcon).not.toBeNull();
		expect(visionIcon?.getAttribute("aria-label")).toBe("Supports image input");
		expect(visionIcon?.getAttribute("title")).toBe("Supports image input");

		// 不支持的不显示
		expect(plainItem?.querySelector('[role="img"]')).toBeNull();

		// 且不出现文字徽标
		expect(visionItem?.textContent).not.toContain("Supports image input");
		expect(plainItem?.textContent).not.toContain("Supports image input");
	});
});
