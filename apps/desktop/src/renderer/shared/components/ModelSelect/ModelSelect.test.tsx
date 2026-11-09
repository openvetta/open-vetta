// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
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
	return {
		options: [visionModel],
		grouped: new Map([["provider", [visionModel]]]),
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
	it("renders vision capability as an icon and not as plain text", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ModelSelect value="provider/vision" onChange={onChange} />);

		const trigger = screen.getByRole("button");
		await user.click(trigger);

		const menuItem = await screen.findByRole("menuitem", { name: /Image Model/ });
		expect(within(menuItem).getByRole("img", { name: "Supports image input" })).toBeTruthy();
		expect(menuItem.textContent).not.toContain("Supports image input");
	});
});
