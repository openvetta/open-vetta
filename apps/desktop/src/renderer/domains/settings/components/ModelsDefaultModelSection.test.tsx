// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelsDefaultModelSection } from "./ModelsDefaultModelSection";
import type { ModelsSettingsModel } from "./useModelsSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@vetta-org/theme-ui/settings", () => ({
	SettingSection: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
	SettingRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@shared/components/ModelSelect", () => ({
	ModelSelect: ({
		value,
		onChange,
		reasoning,
	}: {
		value: string | null;
		onChange: (key: string | null) => void;
		reasoning?: { value?: string; onChange: (level: string) => void };
	}) => (
		<div>
			<span data-testid="level">{reasoning?.value ?? "none"}</span>
			<button type="button" onClick={() => reasoning?.onChange("high")}>
				level
			</button>
			<span data-testid="value">{value ?? "none"}</span>
			<button type="button" onClick={() => onChange("openai/gpt-5")}>
				pick
			</button>
			<button type="button" onClick={() => onChange(null)}>
				clear
			</button>
		</div>
	),
}));

describe("ModelsDefaultModelSection", () => {
	it("reads and writes the default model's thinking level through the shared per-model store", async () => {
		const { getDefaultStore } = await import("jotai");
		const { reasoningByModelAtom } = await import("@shared/store/atoms");
		const store = getDefaultStore();
		store.set(reasoningByModelAtom, { "anthropic/claude": "low" });
		const model = {
			config: { providers: {}, defaultModel: "anthropic/claude" },
			onChangeDefaultModel: vi.fn(),
		} as unknown as ModelsSettingsModel;

		render(<ModelsDefaultModelSection model={model} />);

		expect(screen.getByTestId("level").textContent).toBe("low");
		fireEvent.click(screen.getByText("level"));
		expect(store.get(reasoningByModelAtom)["anthropic/claude"]).toBe("high");
	});

	it("shows the configured default and forwards picks and clears", () => {
		const onChangeDefaultModel = vi.fn();
		const model = {
			config: { providers: {}, defaultModel: "anthropic/claude" },
			onChangeDefaultModel,
		} as unknown as ModelsSettingsModel;

		render(<ModelsDefaultModelSection model={model} />);

		expect(screen.getByTestId("value").textContent).toBe("anthropic/claude");
		fireEvent.click(screen.getByText("pick"));
		expect(onChangeDefaultModel).toHaveBeenCalledWith("openai/gpt-5");
		fireEvent.click(screen.getByText("clear"));
		expect(onChangeDefaultModel).toHaveBeenCalledWith(null);
	});
});
