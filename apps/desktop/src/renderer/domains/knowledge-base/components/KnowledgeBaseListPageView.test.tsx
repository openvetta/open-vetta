// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { describe, expect, it, vi } from "vitest";
import type { useKnowledgeBaseListModel } from "../hooks/useKnowledgeBaseListModel";
import { KnowledgeBaseListPageView } from "./KnowledgeBaseListPageView";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

describe("knowledge base list controls", () => {
	it("keeps search and navigation discoverable from an empty knowledge library", async () => {
		const model: ReturnType<typeof useKnowledgeBaseListModel> = {
			activeId: "default",
			createKnowledgeBase: vi.fn(),
			fileStatuses: {},
			filteredBases: [],
			goBack: vi.fn(),
			knowledgeBases: [],
			narrow: true,
			openKnowledgeBase: vi.fn(),
			search: "",
			setSearch: vi.fn(),
		};
		const user = userEvent.setup();
		render(
			<Provider store={createStore()}>
				<KnowledgeBaseListPageView model={model} />
			</Provider>,
		);
		await user.type(screen.getByRole("searchbox", { name: "kbAllSearch" }), "a");
		expect(model.setSearch).toHaveBeenCalledWith("a");
		await user.click(screen.getByRole("button", { name: "kbAllBack" }));
		expect(model.goBack).toHaveBeenCalledOnce();
		await user.click(screen.getAllByRole("button", { name: "kbCreateBase" })[0]);
		expect(model.createKnowledgeBase).toHaveBeenCalledOnce();
		expect(screen.getByText("kbAllEmptyNone")).toBeTruthy();
	});
});
