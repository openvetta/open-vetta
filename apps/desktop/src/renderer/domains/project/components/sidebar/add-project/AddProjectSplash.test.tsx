// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddProjectSplash } from "./AddProjectSplash";
import type { AddProjectMenuItemModel, AddProjectStep } from "./types";

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
		ssh: {
			listHosts: vi.fn(async () => [{ id: "h1", label: "build-box", target: "me@10.0.0.2" }]),
			listRemoteDirectory: vi.fn(async () => ({
				remotePath: "/home/me",
				entries: [{ name: "app", kind: "directory" }],
			})),
		},
	};
});

afterEach(cleanup);

interface Handlers {
	onClose: ReturnType<typeof vi.fn>;
	onCreateProject: ReturnType<typeof vi.fn>;
	onCloned: ReturnType<typeof vi.fn>;
	onRemoteConfirm: ReturnType<typeof vi.fn>;
	onOpenProject: ReturnType<typeof vi.fn>;
}

/** 复刻宿主 model 的步骤状态：入口点击切步骤，返回回到 root。 */
function Harness({ handlers, taken = [] }: { handlers: Handlers; taken?: string[] }): JSX.Element {
	const [step, setStep] = useState<AddProjectStep>("root");
	const item = (
		action: AddProjectMenuItemModel["action"],
		onSelect: () => void,
	): AddProjectMenuItemModel => ({
		action,
		icon: "icon-[solar--folder-linear]",
		labelKey: `actions.${action}` as AddProjectMenuItemModel["labelKey"],
		descriptionKey: `addProjectSplash.items.${action}` as AddProjectMenuItemModel["descriptionKey"],
		onSelect,
	});
	return (
		<AddProjectSplash
			open
			step={step}
			items={[
				item("newProject", () => setStep("newProject")),
				item("openProject", handlers.onOpenProject),
				item("addFromRemoteHost", () => setStep("remoteHost")),
				item("cloneFromGit", () => setStep("cloneFromGit")),
			]}
			onClose={handlers.onClose}
			onBack={() => setStep("root")}
			isProjectNameTaken={(name) => taken.includes(name)}
			onCreateProject={handlers.onCreateProject}
			onCloned={handlers.onCloned}
			onRemoteConfirm={handlers.onRemoteConfirm}
		/>
	);
}

function handlers(): Handlers {
	return {
		onClose: vi.fn(),
		onCreateProject: vi.fn(),
		onCloned: vi.fn(),
		onRemoteConfirm: vi.fn(),
		onOpenProject: vi.fn(),
	};
}

describe("AddProjectSplash", () => {
	it("lists every entry with its description on the first step", () => {
		const view = render(<Harness handlers={handlers()} />);
		for (const action of ["newProject", "openProject", "addFromRemoteHost", "cloneFromGit"]) {
			expect(view.getByText(`actions.${action}`)).toBeTruthy();
			expect(view.getByText(`addProjectSplash.items.${action}`)).toBeTruthy();
		}
	});

	it("turns the header into a name input for new project and creates on Enter", () => {
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.newProject"));

		const input = view.getByPlaceholderText("newProjectDialog.placeholder");
		fireEvent.change(input, { target: { value: "  demo  " } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(h.onCreateProject).toHaveBeenCalledWith("demo");
	});

	it("blocks empty, invalid and duplicate names with a message", () => {
		const h = handlers();
		const view = render(<Harness handlers={h} taken={["exists"]} />);
		fireEvent.click(view.getByText("actions.newProject"));
		const input = view.getByPlaceholderText("newProjectDialog.placeholder");

		fireEvent.keyDown(input, { key: "Enter" });
		expect(view.getByRole("alert").textContent).toBe("newProjectDialog.emptyError");
		fireEvent.change(input, { target: { value: "a/b" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(view.getByRole("alert").textContent).toBe("newProjectDialog.invalidError");
		fireEvent.change(input, { target: { value: "exists" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(view.getByRole("alert").textContent).toBe("newProjectDialog.duplicateError");
		expect(h.onCreateProject).not.toHaveBeenCalled();
	});

	it("does not submit while an IME composition is in progress", () => {
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.newProject"));
		const input = view.getByPlaceholderText("newProjectDialog.placeholder");
		fireEvent.change(input, { target: { value: "项目" } });

		fireEvent.compositionStart(input);
		fireEvent.keyDown(input, { key: "Enter" });

		expect(h.onCreateProject).not.toHaveBeenCalled();
	});

	it("goes back to the entry list on Esc and closes only from the entry list", () => {
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.newProject"));

		fireEvent.keyDown(window, { key: "Escape" });
		expect(view.getByText("actions.cloneFromGit")).toBeTruthy();
		expect(h.onClose).not.toHaveBeenCalled();

		fireEvent.keyDown(window, { key: "Escape" });
		expect(h.onClose).toHaveBeenCalledTimes(1);
	});

	it("clones from the Git step and reports the new path", async () => {
		clone.mockResolvedValue({ path: "/work/repo", name: "repo" });
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.cloneFromGit"));

		const input = view.getByPlaceholderText("gitCloneDialog.urlPlaceholder");
		fireEvent.change(input, { target: { value: "https://github.com/a/repo.git" } });
		await waitFor(() => expect(view.getByText("/work")).toBeTruthy());
		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => expect(h.onCloned).toHaveBeenCalledWith("/work/repo"));
		expect(clone).toHaveBeenCalledWith(
			expect.objectContaining({ url: "https://github.com/a/repo.git", parentDir: "/work" }),
		);
	});

	it("shows git's reason on failure and stays on the Git step", async () => {
		clone.mockResolvedValue({ error: { code: "clone-failed", message: "repository not found" } });
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.cloneFromGit"));
		const input = view.getByPlaceholderText("gitCloneDialog.urlPlaceholder");
		fireEvent.change(input, { target: { value: "https://github.com/a/missing.git" } });
		await waitFor(() => expect(view.getByText("/work")).toBeTruthy());

		fireEvent.keyDown(input, { key: "Enter" });

		await waitFor(() => expect(view.getByRole("alert").textContent).toContain("repository not found"));
		expect(h.onCloned).not.toHaveBeenCalled();
	});

	it("stops a running clone on Esc instead of leaving the step", async () => {
		let resolveClone: (value: unknown) => void = () => {};
		clone.mockImplementation(() => new Promise((resolve) => (resolveClone = resolve)));
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.cloneFromGit"));
		const input = view.getByPlaceholderText("gitCloneDialog.urlPlaceholder");
		fireEvent.change(input, { target: { value: "https://github.com/a/repo.git" } });
		await waitFor(() => expect(view.getByText("/work")).toBeTruthy());
		fireEvent.keyDown(input, { key: "Enter" });
		await waitFor(() => expect(view.getAllByText("gitCloneDialog.cloning").length).toBeGreaterThan(0));

		fireEvent.keyDown(window, { key: "Escape" });
		expect(cancelClone).toHaveBeenCalledTimes(1);
		expect(view.getByPlaceholderText("gitCloneDialog.urlPlaceholder")).toBeTruthy();
		await act(async () => resolveClone({ error: { code: "cancelled", message: "已取消" } }));

		expect(view.queryByRole("alert")).toBeNull();
	});

	it("picks a host, browses into its directory and confirms the current path", async () => {
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.addFromRemoteHost"));

		fireEvent.click(await view.findByText("build-box"));
		await waitFor(() => expect(view.getByText("app")).toBeTruthy());
		fireEvent.click(view.getByText("remotePicker.confirm"));

		expect(h.onRemoteConfirm).toHaveBeenCalledWith("h1", "/home/me");
	});

	it("steps back from the directory to the host list before leaving the step", async () => {
		const view = render(<Harness handlers={handlers()} />);
		fireEvent.click(view.getByText("actions.addFromRemoteHost"));
		fireEvent.click(await view.findByText("build-box"));
		await waitFor(() => expect(view.getByText("app")).toBeTruthy());

		fireEvent.keyDown(window, { key: "Escape" });
		expect(await view.findByText("build-box")).toBeTruthy();
		fireEvent.keyDown(window, { key: "Escape" });
		expect(view.getByText("actions.newProject")).toBeTruthy();
	});

	it("runs native-dialog entries directly without opening a step", () => {
		const h = handlers();
		const view = render(<Harness handlers={h} />);
		fireEvent.click(view.getByText("actions.openProject"));
		expect(h.onOpenProject).toHaveBeenCalledTimes(1);
		expect(view.getByText("actions.newProject")).toBeTruthy();
	});
});
