// @vitest-environment jsdom

import type { ModelsConfigData } from "@preload/api.js";
import { localModelsConfigAtom, modelCatalog } from "@shared/store/model-catalog";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelsProviderRow } from "./ModelsProviderRow";
import { useModelsSettingsModel } from "./useModelsSettingsModel";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function TestProvider(): JSX.Element {
	return <ModelsProviderRow name="local" model={useModelsSettingsModel()} />;
}

describe("fetched model selection", () => {
	let config: ModelsConfigData;
	let returnedModels: string[];
	let writes: ModelsConfigData[];

	beforeEach(() => {
		config = {
			providers: {
				local: {
					baseUrl: "https://models.example.test/v1",
					api: "openai-completions",
					models: [{ id: "existing" }],
				},
			},
		};
		returnedModels = ["existing", "first-new", "second-new"];
		writes = [];
		vi.stubGlobal("vetta", {
			models: {
				get: async () => config,
				set: async (next: ModelsConfigData) => {
					writes.push(next);
					config = next;
				},
				fetchProviderModels: async () => ({ models: returnedModels }),
			},
			appMonitor: { recordEvent: vi.fn() },
		});
		modelCatalog.reset();
		getDefaultStore().set(localModelsConfigAtom, config);
	});

	afterEach(() => {
		cleanup();
		modelCatalog.reset();
		getDefaultStore().set(localModelsConfigAtom, null);
		vi.unstubAllGlobals();
	});

	it("fetches with no selection, supports bulk and individual choices, and saves only the chosen new models", async () => {
		const user = userEvent.setup();
		render(<TestProvider />);
		await user.click(screen.getByRole("button", { name: /^local / }));
		await user.click(screen.getByRole("button", { name: "fetchModels" }));

		expect(screen.getByRole("button", { name: "addSelectedModels" }).hasAttribute("disabled")).toBe(true);
		expect(screen.getByRole("button", { name: "existing alreadyAdded" }).hasAttribute("disabled")).toBe(true);
		await user.click(screen.getByRole("button", { name: "selectAllFetchedModels" }));
		expect(screen.getByRole("button", { name: "first-new", pressed: true })).toBeTruthy();
		expect(screen.getByRole("button", { name: "second-new", pressed: true })).toBeTruthy();
		expect(screen.getByRole("button", { name: "selectAllFetchedModels" }).hasAttribute("disabled")).toBe(true);

		await user.click(screen.getByRole("button", { name: "deselectAllFetchedModels" }));
		expect(screen.getByRole("button", { name: "addSelectedModels" }).hasAttribute("disabled")).toBe(true);
		await user.click(screen.getByRole("button", { name: "second-new", pressed: false }));
		await user.click(screen.getByRole("button", { name: "addSelectedModels" }));

		await waitFor(() => expect(writes).toHaveLength(1));
		expect(config.providers.local?.models?.map((model) => model.id)).toEqual(["existing", "second-new"]);
		await waitFor(() => expect(screen.queryByRole("button", { name: "selectAllFetchedModels" })).toBeNull());
	});

	it("cancels selection without saving and starts a new fetch unselected", async () => {
		const user = userEvent.setup();
		render(<TestProvider />);
		await user.click(screen.getByRole("button", { name: /^local / }));
		await user.click(screen.getByRole("button", { name: "fetchModels" }));
		await user.click(screen.getByRole("button", { name: "selectAllFetchedModels" }));
		await user.click(screen.getByRole("button", { name: "cancel" }));
		expect(screen.queryByRole("button", { name: "selectAllFetchedModels" })).toBeNull();
		expect(writes).toHaveLength(0);

		await user.click(screen.getByRole("button", { name: "fetchModels" }));
		expect(screen.getByRole("button", { name: "first-new", pressed: false })).toBeTruthy();
		expect(screen.getByRole("button", { name: "addSelectedModels" }).hasAttribute("disabled")).toBe(true);
	});

	it("does not offer an actionable bulk selection when every returned model is already installed", async () => {
		returnedModels = ["existing"];
		const user = userEvent.setup();
		render(<TestProvider />);
		await user.click(screen.getByRole("button", { name: /^local / }));
		await user.click(screen.getByRole("button", { name: "fetchModels" }));

		for (const name of ["selectAllFetchedModels", "deselectAllFetchedModels", "addSelectedModels"]) {
			expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
		}
		expect(writes).toHaveLength(0);
	});
});
