// @vitest-environment jsdom

import { batchProjectsAtom } from "@shared/store/atoms";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStore, Provider } from "jotai";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BatchProjectDialog } from "./BatchProjectDialog";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));

const createdProject = {
	id: "batch-created",
	name: "Review folders",
	prompt: "Review each folder",
	concurrency: 1,
	tasks: [],
	createdAt: 1,
	updatedAt: 1,
};

describe("BatchProjectDialog submission", () => {
	const createProject = vi.fn();
	beforeEach(() => {
		createProject.mockReset();
		vi.stubGlobal("vetta", {
			batchTasks: { createProject, onTaskEvent: () => () => undefined },
			config: { get: async () => ({ projects: [] }), onProjectsChanged: () => () => undefined },
			models: { get: async () => ({ providers: {} }), fetchRemote: async () => ({ providers: {} }) },
			skills: { list: async () => [] },
			dialog: { selectFolders: async () => ["/workspace/input"] },
			im: { onSessionChanged: () => () => undefined },
			session: { onSessionsChanged: () => () => undefined },
		});
	});
	afterEach(() => vi.unstubAllGlobals());

	async function fillProject() {
		const user = userEvent.setup();
		await user.type(screen.getByRole("textbox", { name: "dialog.namePlaceholderNew" }), "Review folders");
		await user.type(screen.getByPlaceholderText("form.promptPlaceholder"), "Review each folder");
		await user.click(screen.getByRole("button", { name: "form.selectFolder" }));
		return user;
	}

	it("creates once for repeated clicks and keeps the dialog busy until the saved project is visible", async () => {
		let resolveCreate: ((value: typeof createdProject) => void) | undefined;
		createProject.mockReturnValue(
			new Promise<typeof createdProject>((resolve) => {
				resolveCreate = resolve;
			}),
		);
		const store = createStore();
		const onClose = vi.fn();
		render(
			<Provider store={store}>
				<BatchProjectDialog open onClose={onClose} />
			</Provider>,
		);
		const user = await fillProject();
		await user.dblClick(screen.getByRole("button", { name: "dialog.create" }));

		expect(createProject).toHaveBeenCalledOnce();
		expect(createProject).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Review folders",
				prompt: "Review each folder",
				folders: ["/workspace/input"],
			}),
		);
		expect((screen.getByRole("button", { name: "dialog.creating" }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
		await user.type(screen.getByRole("textbox", { name: "dialog.namePlaceholderNew" }), " accidental edit");
		await user.type(screen.getByPlaceholderText("form.promptPlaceholder"), " accidental edit");
		expect((screen.getByRole("textbox", { name: "dialog.namePlaceholderNew" }) as HTMLInputElement).value).toBe(
			"Review folders",
		);
		expect((screen.getByPlaceholderText("form.promptPlaceholder") as HTMLTextAreaElement).value).toBe(
			"Review each folder",
		);
		await user.keyboard("{Escape}");
		expect(onClose).not.toHaveBeenCalled();

		await act(async () => resolveCreate?.(createdProject));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(store.get(batchProjectsAtom)).toEqual([createdProject]);
	});

	it("keeps entered data and exposes a retry after creation fails", async () => {
		createProject.mockRejectedValueOnce(new Error("The selected folder is unavailable"));
		createProject.mockResolvedValueOnce(createdProject);
		const onClose = vi.fn();
		render(
			<Provider store={createStore()}>
				<BatchProjectDialog open onClose={onClose} />
			</Provider>,
		);
		const user = await fillProject();
		await user.click(screen.getByRole("button", { name: "dialog.create" }));

		expect((await screen.findByRole("alert")).textContent).toBe("The selected folder is unavailable");
		expect(onClose).not.toHaveBeenCalled();
		expect((screen.getByRole("textbox", { name: "dialog.namePlaceholderNew" }) as HTMLInputElement).value).toBe(
			"Review folders",
		);
		expect((screen.getByPlaceholderText("form.promptPlaceholder") as HTMLTextAreaElement).value).toBe(
			"Review each folder",
		);
		expect(screen.getByText("/workspace/input")).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "dialog.create" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(createProject).toHaveBeenCalledTimes(2);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("clears a previous error when the same new-project draft is reopened", async () => {
		createProject.mockRejectedValueOnce(new Error("The selected folder is unavailable"));
		function DialogOwner(): JSX.Element {
			const [open, setOpen] = useState(true);
			return (
				<>
					<button type="button" onClick={() => setOpen(true)}>
						Reopen project
					</button>
					<BatchProjectDialog open={open} onClose={() => setOpen(false)} />
				</>
			);
		}
		render(
			<Provider store={createStore()}>
				<DialogOwner />
			</Provider>,
		);
		const user = await fillProject();
		await user.click(screen.getByRole("button", { name: "dialog.create" }));
		expect(await screen.findByRole("alert")).toBeTruthy();
		await user.click(screen.getByRole("button", { name: "dialog.cancel" }));
		await user.click(screen.getByRole("button", { name: "Reopen project" }));
		expect(screen.queryByRole("alert")).toBeNull();
		expect((screen.getByRole("textbox", { name: "dialog.namePlaceholderNew" }) as HTMLInputElement).value).toBe(
			"Review folders",
		);
		expect((screen.getByPlaceholderText("form.promptPlaceholder") as HTMLTextAreaElement).value).toBe(
			"Review each folder",
		);
	});
});
