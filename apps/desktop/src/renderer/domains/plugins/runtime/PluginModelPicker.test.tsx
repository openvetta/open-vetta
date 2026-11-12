// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginModelPicker } from "./PluginModelPicker";

const catalog = vi.hoisted(() => ({ revalidate: vi.fn(async () => undefined) }));
const modelOptions = vi.hoisted(() => {
	const fast = { provider: "acme", modelId: "fast", displayName: "Fast", key: "acme/fast" };
	const deep = {
		provider: "acme",
		modelId: "deep",
		displayName: "Deep",
		key: "acme/deep",
		reasoning: true,
		reasoningLevels: ["low", "high"],
		defaultReasoningLevel: "low",
	};
	return {
		options: [fast, deep],
		grouped: new Map([["acme", [fast, deep]]]),
		defaultKey: "acme/fast",
		iconFor: () => undefined,
		labelFor: () => "Acme",
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
				"modelSelect.defaultBadge": "Default",
				"modelSelect.searchPlaceholder": "Search models",
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
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("PluginModelPicker", () => {
	it("maps the plugin contract onto the host model selector", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<PluginModelPicker
				value={null}
				onChange={onChange}
				emptyOption={{ label: "Board default" }}
				placeholder="Board default"
				defaultModelKey="acme/deep"
				ariaLabel="Card model"
				className="plugin-trigger"
				menuClassName="plugin-menu"
			/>,
		);

		const trigger = screen.getByRole("button", { name: "Card model" });
		expect(trigger.className).toContain("plugin-trigger");
		expect(trigger.textContent).toContain("Board default");
		await user.click(trigger);
		expect(screen.getByRole("menu").className).toContain("plugin-menu");

		await user.click(await screen.findByRole("menuitem", { name: /Fast/ }));
		expect(onChange).toHaveBeenLastCalledWith("acme/fast");

		await user.click(trigger);
		await user.click(await screen.findByRole("menuitem", { name: "Board default" }));
		expect(onChange).toHaveBeenLastCalledWith(null);
	});

	it("only offers reasoning levels when the plugin controls them", async () => {
		const user = userEvent.setup();
		const onLevel = vi.fn();
		render(
			<PluginModelPicker
				value="acme/deep"
				onChange={vi.fn()}
				ariaLabel="Model"
				reasoning={{ value: "high", onChange: onLevel }}
			/>,
		);
		const trigger = screen.getByRole("button", { name: "Model" });
		expect(trigger.textContent).toContain("high");
		await user.click(trigger);
		const levels = await screen.findAllByRole("menuitem", { name: "low" });
		await user.click(levels[0] as HTMLElement);
		expect(onLevel).toHaveBeenCalledWith("low");
	});
});
