// @vitest-environment jsdom
import type { ModelsConfigData } from "@preload/api.js";
import { localModelsConfigAtom } from "@shared/store/model-catalog";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDefaultStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { ModelsProviderRow } from "./ModelsProviderRow";
import { useModelsSettingsModel } from "./useModelsSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./recordSettingsUsage", () => ({ recordSettingsUsage: vi.fn() }));

function TestProvider(): JSX.Element {
	return <ModelsProviderRow name="custom" model={useModelsSettingsModel()} />;
}

describe("custom model pricing", () => {
	it("adds four USD rates, persists them, and preserves them while editing the model", async () => {
		const user = userEvent.setup();
		let config: ModelsConfigData = {
			providers: { custom: { baseUrl: "https://example.test/v1", api: "openai-completions", models: [] } },
		};
		(window as unknown as { vetta: unknown }).vetta = {
			models: {
				get: async () => config,
				set: async (next: ModelsConfigData) => {
					config = next;
				},
			},
		};
		getDefaultStore().set(localModelsConfigAtom, config);
		render(<TestProvider />);

		await user.click(screen.getByTitle("edit"));
		for (const name of ["providerName", "baseUrl", "apiKey", "customHeaders"]) {
			await user.click(screen.getByText(name));
			expect(document.activeElement).toBe(screen.getByLabelText(name));
		}
		await user.click(screen.getByText("apiType", { selector: "label" }));
		expect(screen.getByRole("button", { name: "apiType", expanded: true })).toBeTruthy();
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "cancel" }));
		await user.click(screen.getByRole("button", { name: "addModel" }));
		for (const name of [
			"modelId",
			"displayName",
			"contextWindow",
			"maxOutputTokens",
			"costInput",
			"costOutput",
			"costCacheRead",
			"costCacheWrite",
		]) {
			await user.click(screen.getByText(name));
			expect(document.activeElement).toBe(screen.getByRole("textbox", { name }));
		}
		await user.click(screen.getByText("apiType", { selector: "label" }));
		expect(screen.getByRole("button", { name: "apiType", expanded: true })).toBeTruthy();
		await user.keyboard("{Escape}");
		expect(screen.getByRole("group", { name: "inputCapability" })).toBeTruthy();
		await user.type(screen.getByRole("textbox", { name: "modelId" }), "my-model");
		const imageInput = screen.getByRole("checkbox", { name: "Image" });
		imageInput.focus();
		await user.keyboard(" ");
		expect(screen.getByRole("checkbox", { name: "Image", checked: true })).toBeTruthy();
		await user.type(screen.getByRole("textbox", { name: "costInput" }), "1.25");
		await user.type(screen.getByRole("textbox", { name: "costOutput" }), "8");
		await user.type(screen.getByRole("textbox", { name: "costCacheRead" }), "0.125");
		expect(screen.getByRole("button", { name: "add" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByText("modelPriceInvalid")).toBeTruthy();
		await user.type(screen.getByRole("textbox", { name: "costCacheWrite" }), "2");
		await user.click(screen.getByRole("button", { name: "add" }));
		await waitFor(() =>
			expect(config.providers.custom?.models?.[0]?.cost).toEqual({
				input: 1.25,
				output: 8,
				cacheRead: 0.125,
				cacheWrite: 2,
			}),
		);

		await user.click(screen.getByTitle("editModel"));
		expect((screen.getByRole("textbox", { name: "costInput" }) as HTMLInputElement).value).toBe("1.25");
		fireEvent.change(screen.getByRole("textbox", { name: "displayName" }), { target: { value: "Renamed model" } });
		await user.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() =>
			expect(config.providers.custom?.models?.[0]).toMatchObject({
				id: "my-model",
				name: "Renamed model",
				cost: { input: 1.25, output: 8, cacheRead: 0.125, cacheWrite: 2 },
			}),
		);
	});
});
