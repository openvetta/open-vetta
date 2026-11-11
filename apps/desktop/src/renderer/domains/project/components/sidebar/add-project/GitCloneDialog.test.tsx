// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddProjectSplashDialog } from "./AddProjectSplashDialog";
import { GitCloneDialog } from "./GitCloneDialog";
import type { AddProjectMenuItemModel } from "./types";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { message?: string }) => (options?.message ? `${key}:${options.message}` : key),
	}),
}));

const clone = vi.fn();
const cancelClone = vi.fn(async () => undefined);

beforeEach(() => {
	clone.mockReset();
	cancelClone.mockClear();
	(window as unknown as { vetta: unknown }).vetta = {
		project: {
			list: vi.fn(async () => ({ workspacePath: "/work", projects: [], archivedProjects: [] })),
			clone,
			cancelClone,
		},
		dialog: { selectFolder: vi.fn(async () => "/picked") },
	};
});

afterEach(cleanup);

async function fillUrl(view: ReturnType<typeof render>, url: string): Promise<void> {
	fireEvent.change(view.getByPlaceholderText("gitCloneDialog.urlPlaceholder"), { target: { value: url } });
	// 默认存放目录来自异步读取的工作目录，等它就绪后「克隆」才可点。
	await waitFor(() => expect(view.getByText("/work")).toBeTruthy());
}

describe("GitCloneDialog", () => {
	it("clones into the workspace by default and reports the new path", async () => {
		clone.mockResolvedValue({ path: "/work/repo", name: "repo" });
		const onCloned = vi.fn();
		const view = render(<GitCloneDialog onCloned={onCloned} onCancel={vi.fn()} />);
		await fillUrl(view, "https://github.com/a/repo.git");

		fireEvent.click(view.getByText("gitCloneDialog.clone"));

		await waitFor(() => expect(onCloned).toHaveBeenCalledWith("/work/repo"));
		expect(clone).toHaveBeenCalledWith(
			expect.objectContaining({ url: "https://github.com/a/repo.git", parentDir: "/work" }),
		);
	});

	it("shows git's reason on failure and does not report success", async () => {
		clone.mockResolvedValue({ error: { code: "clone-failed", message: "repository not found" } });
		const onCloned = vi.fn();
		const view = render(<GitCloneDialog onCloned={onCloned} onCancel={vi.fn()} />);
		await fillUrl(view, "https://github.com/a/missing.git");

		fireEvent.click(view.getByText("gitCloneDialog.clone"));

		await waitFor(() => expect(view.getByRole("alert").textContent).toContain("repository not found"));
		expect(onCloned).not.toHaveBeenCalled();
	});

	it("stays silent when the user cancels a running clone", async () => {
		let resolveClone: (value: unknown) => void = () => {};
		clone.mockImplementation(() => new Promise((resolve) => (resolveClone = resolve)));
		const view = render(<GitCloneDialog onCloned={vi.fn()} onCancel={vi.fn()} />);
		await fillUrl(view, "https://github.com/a/repo.git");

		fireEvent.click(view.getByText("gitCloneDialog.clone"));
		await waitFor(() => expect(view.getByText("gitCloneDialog.stop")).toBeTruthy());
		fireEvent.click(view.getByText("gitCloneDialog.stop"));
		expect(cancelClone).toHaveBeenCalledTimes(1);
		resolveClone({ error: { code: "cancelled", message: "已取消" } });

		await waitFor(() => expect(view.getByText("gitCloneDialog.clone")).toBeTruthy());
		expect(view.queryByRole("alert")).toBeNull();
	});

	it("keeps the clone button disabled until a URL is entered", async () => {
		const view = render(<GitCloneDialog onCloned={vi.fn()} onCancel={vi.fn()} />);
		await waitFor(() => expect(view.getByText("/work")).toBeTruthy());
		expect((view.getByText("gitCloneDialog.clone") as HTMLButtonElement).disabled).toBe(true);
	});
});

describe("AddProjectSplashDialog", () => {
	const item = (action: AddProjectMenuItemModel["action"], onSelect = vi.fn()): AddProjectMenuItemModel => ({
		action,
		icon: "icon-[solar--folder-linear]",
		labelKey: `actions.${action}` as AddProjectMenuItemModel["labelKey"],
		descriptionKey: `addProjectSplash.items.${action}` as AddProjectMenuItemModel["descriptionKey"],
		onSelect,
	});

	it("renders every option with its description and selects on click", () => {
		const onSelect = vi.fn();
		const view = render(
			<AddProjectSplashDialog
				open
				items={[item("newProject"), item("cloneFromGit", onSelect)]}
				onClose={vi.fn()}
			/>,
		);

		expect(view.getByText("addProjectSplash.items.newProject")).toBeTruthy();
		fireEvent.click(view.getByText("actions.cloneFromGit"));
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it("closes on Escape", () => {
		const onClose = vi.fn();
		render(<AddProjectSplashDialog open items={[item("newProject")]} onClose={onClose} />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
