// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDetailPageView, type ProjectDetailPageViewLabels } from "@vetta-org/theme-ui/project";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useProjectInstructions } from "../hooks/useProjectInstructions";

const labels: ProjectDetailPageViewLabels = {
	showInFolderTitle: "Show in folder",
	showInFolder: "Show in folder",
	exportTitle: "Export project",
	export: "Export",
	newSession: "New conversation",
	closeActivityPanel: "Close files",
	openActivityPanel: "Open files",
	persona: "Project instructions",
	unsavedChanges: "Unsaved changes",
	saved: "Saved",
	saveFailed: "Couldn't save",
	save: "Save",
	editorPlaceholder: "Enter instructions",
	agentsMdHint: "Saved in AGENTS.md",
	quickSave: "Quick save",
	saveShortcut: "Ctrl+S",
	retry: "Retry loading",
};
const noAction = () => {};

function Project() {
	const model = useProjectInstructions("/projects/example");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	return (
		<ProjectDetailPageView
			activityOpen={false}
			activityPanel={null}
			batchSection={null}
			content={model.content}
			createdAtLabel={null}
			cwd="/projects/example"
			displayName="Example"
			editorFocused={false}
			exportable={false}
			isDirty={model.isDirty}
			labels={labels}
			loading={model.loading}
			loadError={model.loadError ? "Couldn't read project instructions" : null}
			onReload={model.reload}
			onContentChange={model.setContent}
			onEditorBlur={noAction}
			onEditorFocus={noAction}
			onExport={noAction}
			onNewSession={noAction}
			onSave={() => void model.save()}
			onShowInFolder={noAction}
			onToggleActivity={noAction}
			projectTypeLabel={null}
			saveStatus={model.saveStatus}
			sessionCountLabel="1 conversation"
			taskCountLabel={null}
			textareaRef={textareaRef}
		/>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("keeps the editor unavailable after a read failure and restores editing only after a successful retry", async () => {
	const readFile = vi
		.fn()
		.mockRejectedValueOnce(new Error("Read failed"))
		.mockResolvedValue({ content: "Existing instructions", encoding: "utf8" });
	const writeFile = vi.fn().mockResolvedValue(undefined);
	vi.stubGlobal("vetta", { fs: { readFile, writeFile } });
	render(<Project />);
	expect((await screen.findByRole("alert")).textContent).toContain("Couldn't read project instructions");
	expect(screen.queryByRole("textbox", { name: "Project instructions" })).toBeNull();
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(writeFile).not.toHaveBeenCalled();
	await userEvent.click(screen.getByRole("button", { name: "Retry loading" }));
	const editor = await screen.findByRole("textbox", { name: "Project instructions" });
	expect((editor as HTMLTextAreaElement).value).toBe("Existing instructions");
	await userEvent.type(editor, " with an edit");
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(writeFile).toHaveBeenCalledWith("/projects/example/AGENTS.md", "Existing instructions with an edit");
});

it("announces loading and lets users find, edit, retry and save their project instructions by label", async () => {
	let finishRead!: (value: { content: string; encoding: "utf8" }) => void;
	const readFile = vi.fn(
		() =>
			new Promise<{ content: string; encoding: "utf8" }>((resolve) => {
				finishRead = resolve;
			}),
	);
	const writeFile = vi.fn().mockRejectedValueOnce(new Error("Disk unavailable")).mockResolvedValue(undefined);
	vi.stubGlobal("vetta", { fs: { readFile, writeFile } });
	render(<Project />);
	expect(screen.getByRole("status", { name: "Project instructions" }).getAttribute("aria-busy")).toBe("true");
	await act(async () => finishRead({ content: "Original", encoding: "utf8" }));
	const editor = screen.getByRole("textbox", { name: "Project instructions" });
	await userEvent.clear(editor);
	await userEvent.type(editor, "New project guidance");
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect(await screen.findByRole("alert", { name: "Couldn't save" })).toBeTruthy();
	expect((editor as HTMLTextAreaElement).value).toBe("New project guidance");
	await userEvent.click(screen.getByRole("button", { name: "Save" }));
	expect((await screen.findByRole("status")).textContent).toContain("Saved");
	expect(writeFile).toHaveBeenLastCalledWith("/projects/example/AGENTS.md", "New project guidance");
	expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
});
