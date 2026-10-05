// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SkillsPageModel } from "../hooks/useSkillsPageModel";
import { SkillsPageView } from "./SkillsPageView";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function model(overrides: Partial<SkillsPageModel> = {}): SkillsPageModel {
	return {
		searchQuery: "",
		setSearchQuery: vi.fn(),
		loading: false,
		error: null,
		actionStates: {},
		fileInputRef: createRef<HTMLInputElement>(),
		groups: new Map(),
		agentForTab: [],
		hasContent: false,
		handleInstall: vi.fn(),
		handleToggle: vi.fn(),
		handleUninstall: vi.fn(),
		handlePreview: vi.fn(),
		handleFileChange: vi.fn(),
		...overrides,
	};
}

describe("scene page accessibility and states", () => {
	it("names the search field and keeps search usable when there are no matching scenes", async () => {
		const page = model();
		const user = userEvent.setup();
		const { rerender } = render(<SkillsPageView model={page} />);
		const search = screen.getByRole("searchbox", { name: "search.placeholder" });
		await user.type(search, "x");
		expect(page.setSearchQuery).toHaveBeenCalledWith("x");
		rerender(<SkillsPageView model={{ ...page, searchQuery: "x" }} />);
		expect(screen.getByText("empty.noMatch")).toBeTruthy();
		expect(screen.getByRole("searchbox", { name: "search.placeholder" })).toBe(search);
	});

	it("announces loading and failure instead of exposing the empty state during a request", () => {
		const page = model({ loading: true });
		const { rerender } = render(<SkillsPageView model={page} />);
		expect(screen.getByRole("status").textContent).toContain("loading");
		expect(screen.queryByText("empty.none")).toBeNull();
		rerender(<SkillsPageView model={{ ...page, loading: false, error: "Scene list unavailable" }} />);
		expect(screen.getByRole("alert").textContent).toContain("Scene list unavailable");
		expect(screen.queryByRole("status")).toBeNull();
	});
});
