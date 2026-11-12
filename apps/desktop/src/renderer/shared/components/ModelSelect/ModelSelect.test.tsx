// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelSelect } from "./ModelSelect";

const catalog = vi.hoisted(() => ({ revalidate: vi.fn(async () => undefined) }));
const modelOptions = vi.hoisted(() => {
	const visionModel = {
		provider: "provider",
		modelId: "vision",
		displayName: "Image Model",
		key: "provider/vision",
		supportsImage: true,
		multiplier: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
	};
	const thinkingModel = {
		provider: "provider",
		modelId: "thinker",
		displayName: "Thinking Model",
		key: "provider/thinker",
		reasoning: true,
		reasoningLevels: ["low", "high"],
		defaultReasoningLevel: "low",
	};
	return {
		options: [visionModel, thinkingModel],
		grouped: new Map([["provider", [visionModel, thinkingModel]]]),
		defaultKey: "provider/vision",
		iconFor: () => "provider-icon",
		labelFor: () => "Provider",
	};
});

vi.mock("@shared/store/model-catalog", () => ({ modelCatalog: catalog }));
vi.mock("@shared/components/ModelSelect/useModelOptions", () => ({
	useModelOptions: () => modelOptions,
}));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, string | number>) => {
			const labels: Record<string, string> = {
				"modelSelect.placeholder": "Select model",
				"modelSelect.unset": "Not set",
				"modelSelect.clearSearch": "Clear search",
				"modelSelect.cloudOnly": "Cloud",
				"modelSelect.defaultBadge": "Default",
				"modelSelect.free": "Free",
				"modelSelect.modelHeader": "Models",
				"modelSelect.noResults": "No models",
				"modelSelect.noResultsHint": "Try another query",
				"modelSelect.reasoningHeader": "Reasoning",
				"modelSelect.searchPlaceholder": "Search models",
				"modelSelect.visionBadge": "Supports image input",
			};
			return labels[key] ?? values?.defaultValue?.toString() ?? key;
		},
	}),
}));

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	HTMLElement.prototype.scrollIntoView = vi.fn();
	catalog.revalidate.mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ModelSelect", () => {
	it("renders the input bar's selector view with a form-field trigger", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ModelSelect value="provider/vision" onChange={onChange} ariaLabel="Model" />);

		const trigger = screen.getByRole("button", { name: "Model" });
		expect(trigger.className).toContain("border-input");
		await user.click(trigger);
		expect(catalog.revalidate).toHaveBeenCalled();

		// 与输入栏同一个视图：有搜索框，行尾是详情按钮而不是平铺的能力文字。
		expect(await screen.findByRole("searchbox", { name: "Search models" })).toBeTruthy();
		const visionModel = await screen.findByRole("menuitem", { name: /Image Model/ });
		expect(within(visionModel).getByRole("button", { name: "modelSelect.info.button" })).toBeTruthy();
		expect(visionModel.textContent).not.toContain("Supports image input");

		await user.click(await screen.findByRole("menuitem", { name: /Thinking Model/ }));
		expect(onChange).toHaveBeenCalledWith("provider/thinker");
	});

	it("offers a clear entry only when allowClear is set", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		const { unmount } = render(
			<ModelSelect value="provider/vision" onChange={onChange} allowClear clearLabel="Follow default" ariaLabel="Model" />,
		);
		await user.click(screen.getByRole("button", { name: "Model" }));
		await user.click(await screen.findByRole("menuitem", { name: "Follow default" }));
		expect(onChange).toHaveBeenLastCalledWith(null);
		unmount();

		render(<ModelSelect value="provider/vision" onChange={vi.fn()} ariaLabel="Model" />);
		await user.click(screen.getByRole("button", { name: "Model" }));
		await screen.findByRole("searchbox", { name: "Search models" });
		expect(screen.queryByRole("menuitem", { name: "Not set" })).toBeNull();
	});

	it("shows the reasoning column only for callers that control reasoning", async () => {
		const user = userEvent.setup();
		const onReasoning = vi.fn();
		const { unmount } = render(
			<ModelSelect
				value="provider/thinker"
				onChange={vi.fn()}
				ariaLabel="Model"
				reasoning={{ value: undefined, onChange: onReasoning }}
			/>,
		);
		// 没有记住档位时，触发器显示模型的默认档位。
		expect(screen.getByRole("button", { name: "Model" }).textContent).toContain("low");
		await user.click(screen.getByRole("button", { name: "Model" }));
		await user.click(await screen.findByRole("menuitem", { name: "high" }));
		expect(onReasoning).toHaveBeenCalledWith("high");
		unmount();

		render(<ModelSelect value="provider/thinker" onChange={vi.fn()} ariaLabel="Model" />);
		await user.click(screen.getByRole("button", { name: "Model" }));
		await screen.findByRole("searchbox", { name: "Search models" });
		expect(screen.queryByText("Reasoning")).toBeNull();
	});

	it("applies the configured default once when autoSelectDefault is on", async () => {
		const onChange = vi.fn();
		render(<ModelSelect value={null} onChange={onChange} autoSelectDefault />);
		await waitFor(() => expect(onChange).toHaveBeenCalledWith("provider/vision"));
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it("keeps showing a saved model that the catalog no longer lists", () => {
		render(<ModelSelect value="gone/legacy-model" onChange={vi.fn()} ariaLabel="Model" />);
		expect(screen.getByRole("button", { name: "Model" }).textContent).toContain("legacy-model");
	});
});
