import { LegacyRuntimeSessionHistoryController, type RuntimeSession } from "@vetta/coding-agent/runtime-host";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeSessionHistoryController } from "../../src/index.js";

function createHistorySessionDouble(options: { isStreaming?: boolean; isBashRunning?: boolean } = {}) {
	const getEntry = vi.fn((): { id: string } | undefined => ({ id: "edit-entry" }));
	const navigateTree = vi.fn(async () => ({ editorText: "edit text", cancelled: false }));
	const switchBranch = vi.fn(() => ({ leafId: "branch-leaf" }));
	const appendBranchSummary = vi.fn(() => ({ entryId: "summary-entry" }));
	const deleteMessage = vi.fn(() => ({ leafId: "delete-leaf" }));
	const replaceLastUserMessage = vi.fn(() => ({ leafId: "replace-leaf" }));
	const exportForkToNewFile = vi.fn(() => ({ path: "fork.jsonl", text: "fork text" }));
	const setSessionName = vi.fn();
	const session = {
		isStreaming: options.isStreaming ?? false,
		isBashRunning: options.isBashRunning ?? false,
		sessionManager: {
			getEntry,
		},
		navigateTree,
		switchBranch,
		appendBranchSummary,
		deleteMessage,
		replaceLastUserMessage,
		exportForkToNewFile,
		setSessionName,
	} as unknown as RuntimeSession;

	return {
		controller: new LegacyRuntimeSessionHistoryController(session),
		getEntry,
		navigateTree,
		switchBranch,
		appendBranchSummary,
		deleteMessage,
		replaceLastUserMessage,
		exportForkToNewFile,
		setSessionName,
	};
}

describe("LegacyRuntimeSessionHistoryController", () => {
	it("preserves successful edit, branch, delete, replace, fork and rename behavior", async () => {
		const history = createHistorySessionDouble();

		await expect(history.controller.navigateForEdit("edit-entry")).resolves.toEqual({
			text: "edit text",
			cancelled: false,
		});
		await expect(history.controller.switchBranch("branch-entry")).resolves.toEqual({ leafId: "branch-leaf" });
		await expect(
			history.controller.appendBranchSummary("branch-entry", "summary", { files: [] }, true),
		).resolves.toEqual({ entryId: "summary-entry" });
		await expect(history.controller.deleteMessage("delete-entry")).resolves.toEqual({ leafId: "delete-leaf" });
		await expect(history.controller.replaceLastUserMessage("replace-entry")).resolves.toEqual({
			leafId: "replace-leaf",
		});
		await expect(history.controller.forkSession("fork-entry")).resolves.toEqual({
			path: "fork.jsonl",
			text: "fork text",
		});
		await history.controller.setName("renamed");

		expect(history.getEntry).toHaveBeenCalledWith("edit-entry");
		expect(history.navigateTree).toHaveBeenCalledWith("edit-entry", { summarize: false });
		expect(history.switchBranch).toHaveBeenCalledWith("branch-entry");
		expect(history.appendBranchSummary).toHaveBeenCalledWith("branch-entry", "summary", { files: [] }, true);
		expect(history.deleteMessage).toHaveBeenCalledWith("delete-entry");
		expect(history.replaceLastUserMessage).toHaveBeenCalledWith("replace-entry");
		expect(history.exportForkToNewFile).toHaveBeenCalledWith("fork-entry");
		expect(history.setSessionName).toHaveBeenCalledWith("renamed");
	});

	it("preserves cancelled navigation and discards editor text", async () => {
		const history = createHistorySessionDouble();
		history.navigateTree.mockResolvedValue({ editorText: "must not escape", cancelled: true });

		await expect(history.controller.navigateForEdit("edit-entry")).resolves.toEqual({
			text: "",
			cancelled: true,
		});
	});

	it("rejects a stale edit target before navigating", async () => {
		const history = createHistorySessionDouble();
		history.getEntry.mockReturnValue(undefined);

		await expect(history.controller.navigateForEdit("missing-entry")).rejects.toThrow(
			"Entry missing-entry not found",
		);
		expect(history.navigateTree).not.toHaveBeenCalled();
	});

	const blockedCommands: Array<{
		name: string;
		message: string;
		run(controller: RuntimeSessionHistoryController): unknown;
	}> = [
		{
			name: "edit",
			message: "Cannot edit message while the session is streaming",
			run: (controller) => controller.navigateForEdit("entry"),
		},
		{
			name: "switch branch",
			message: "Cannot switch branch while the session is streaming",
			run: (controller) => controller.switchBranch("entry"),
		},
		{
			name: "delete",
			message: "Cannot delete a message while the session is streaming",
			run: (controller) => controller.deleteMessage("entry"),
		},
		{
			name: "summarize branch",
			message: "Cannot summarize branch while the session is streaming",
			run: (controller) => controller.appendBranchSummary("entry", "summary"),
		},
		{
			name: "replace",
			message: "Cannot replace a message while the session is streaming",
			run: (controller) => controller.replaceLastUserMessage("entry"),
		},
		{
			name: "fork",
			message: "Cannot fork while the session is streaming",
			run: (controller) => controller.forkSession("entry"),
		},
	];

	it.each([
		{ busyState: "streaming", options: { isStreaming: true } },
		{ busyState: "bash", options: { isBashRunning: true } },
	])("preserves every mutation guard while $busyState is active", async ({ options }) => {
		const { controller } = createHistorySessionDouble(options);
		for (const command of blockedCommands) {
			await expect(
				Promise.resolve().then(() => command.run(controller)),
				command.name,
			).rejects.toThrow(command.message);
		}
	});
});
