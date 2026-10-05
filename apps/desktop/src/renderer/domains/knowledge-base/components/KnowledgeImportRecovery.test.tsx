// @vitest-environment jsdom

import { knowledgeBaseEnabledAtom, knowledgeBasesAtom, knowledgeImportDraftAtom } from "@shared/store/atoms";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useKnowledgeBasePageModel } from "../hooks/useKnowledgeBasePageModel";
import { KnowledgeBasePageView } from "./KnowledgeBasePageView";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));

function ImportPage(): JSX.Element {
	return <KnowledgeBasePageView model={useKnowledgeBasePageModel()} />;
}

describe("knowledge import recovery", () => {
	const create = vi.fn();
	const addFiles = vi.fn();
	const list = vi.fn();
	beforeEach(() => {
		create.mockReset().mockResolvedValue(undefined);
		addFiles.mockReset().mockResolvedValue(undefined);
		list.mockReset().mockResolvedValue([]);
		vi.stubGlobal("vetta", {
			knowledge: {
				create,
				addFiles,
				list,
				fileStatuses: async () => ({}),
				onStatusesChanged: () => () => undefined,
			},
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	function openImport() {
		const store = createStore();
		store.set(knowledgeBaseEnabledAtom, true);
		store.set(knowledgeImportDraftAtom, { sourcePaths: ["/workspace/input.pdf"], defaultTargetId: null });
		render(
			<Provider store={store}>
				<ImportPage />
			</Provider>,
		);
		return store;
	}

	it("preserves the entered name and selected files when creating a library fails, then retries", async () => {
		create.mockRejectedValueOnce(new Error("Unable to create library"));
		const store = openImport();
		const user = userEvent.setup();
		const dialog = within(screen.getByRole("dialog"));
		const name = dialog.getByRole("textbox", { name: "kbImportNameLabel" });
		await user.clear(name);
		await user.type(name, "Research");
		await user.click(dialog.getByRole("button", { name: "kbImportStartBtn" }));

		expect((await screen.findByRole("alert")).textContent).toBe("Unable to create library");
		expect((name as HTMLInputElement).value).toBe("Research");
		expect(store.get(knowledgeImportDraftAtom)?.sourcePaths).toEqual(["/workspace/input.pdf"]);
		await user.click(dialog.getByRole("button", { name: "kbImportStartBtn" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(create).toHaveBeenLastCalledWith("Research");
		expect(addFiles).toHaveBeenCalledWith("Research", ["/workspace/input.pdf"], false);
		expect(store.get(knowledgeImportDraftAtom)).toBeNull();
	});

	it("reuses the new library if only importing its files failed", async () => {
		addFiles.mockRejectedValueOnce(new Error("File cannot be read"));
		openImport();
		const user = userEvent.setup();
		const dialog = within(screen.getByRole("dialog"));
		await user.click(dialog.getByRole("button", { name: "kbImportStartBtn" }));
		expect((await screen.findByRole("alert")).textContent).toBe("File cannot be read");
		await user.click(dialog.getByRole("button", { name: "kbImportStartBtn" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(create).toHaveBeenCalledOnce();
		expect(addFiles).toHaveBeenCalledTimes(2);
	});

	it("names the current library search and view controls while preserving their actions", async () => {
		const base = { id: "Research", name: "Research", isDefault: false, updatedAt: 1, nodes: [] };
		list.mockResolvedValue([base]);
		const store = createStore();
		store.set(knowledgeBaseEnabledAtom, true);
		store.set(knowledgeBasesAtom, [base]);
		render(
			<Provider store={store}>
				<ImportPage />
			</Provider>,
		);
		const user = userEvent.setup();
		await user.click(screen.getByRole("button", { name: "kbPageListView" }));
		expect(screen.getByRole("button", { name: "kbPageListView" }).getAttribute("aria-pressed")).toBe("true");
		await user.type(screen.getByRole("searchbox", { name: "kbPageSearch" }), "Report");
		expect((screen.getByRole("searchbox", { name: "kbPageSearch" }) as HTMLInputElement).value).toBe("Report");
		await user.click(screen.getByRole("button", { name: "kbPageRefresh" }));
		await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
	});
});
