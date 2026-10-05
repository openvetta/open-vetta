// @vitest-environment jsdom

import type { TaskExecutionRecord } from "@shared/store/atoms";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExecutionHistoryView } from "@vetta-org/theme-ui/scheduler";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExecutionHistory } from "./ExecutionHistory";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate, i18n: { language: "en" } }) }));

function record(taskId: string): TaskExecutionRecord {
	return {
		id: `${taskId}:run`,
		taskId,
		startedAt: 1,
		completedAt: 2,
		status: "success",
		prompt: "Review",
		responsePreview: `${taskId} result`,
	};
}

describe("execution history recovery", () => {
	const getRecords = vi.fn();
	beforeEach(() => {
		getRecords.mockReset();
		vi.stubGlobal("vetta", { scheduler: { getRecords, onTaskEvent: () => () => undefined } });
	});
	afterEach(() => vi.unstubAllGlobals());

	it("distinguishes a failed read from an empty history and lets the user refresh", async () => {
		getRecords.mockRejectedValueOnce(new Error("Read failed"));
		getRecords.mockResolvedValueOnce([record("task-a")]);
		render(<ExecutionHistory taskId="task-a" />);
		expect((await screen.findByRole("alert")).textContent).toBe("history.loadFailed");
		expect(screen.queryByText("history.empty")).toBeNull();

		await userEvent.setup().click(screen.getByRole("button", { name: "history.refresh" }));
		expect(await screen.findByText("task-a result")).toBeTruthy();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keeps the previous records visible when a refresh fails", async () => {
		getRecords.mockResolvedValueOnce([record("task-a")]);
		getRecords.mockRejectedValueOnce(new Error("Read failed"));
		render(<ExecutionHistory taskId="task-a" />);
		expect(await screen.findByText("task-a result")).toBeTruthy();
		await userEvent.setup().click(screen.getByRole("button", { name: "history.refresh" }));
		expect(await screen.findByRole("alert")).toBeTruthy();
		expect(screen.getByText("task-a result")).toBeTruthy();
	});

	it("ignores the old task's response after the user switches tasks", async () => {
		let resolveFirst: ((value: TaskExecutionRecord[]) => void) | undefined;
		getRecords.mockReturnValueOnce(
			new Promise<TaskExecutionRecord[]>((resolve) => {
				resolveFirst = resolve;
			}),
		);
		getRecords.mockResolvedValueOnce([record("task-b")]);
		const { rerender } = render(<ExecutionHistory taskId="task-a" />);
		rerender(<ExecutionHistory taskId="task-b" />);
		expect(await screen.findByText("task-b result")).toBeTruthy();
		await act(async () => resolveFirst?.([record("task-a")]));
		await waitFor(() => expect(screen.queryByText("task-a result")).toBeNull());
		expect(screen.getByText("task-b result")).toBeTruthy();
	});
	it("opens a recorded session with the keyboard and keeps entries without a session read-only", async () => {
		const user = userEvent.setup();
		const onOpenRecord = vi.fn();
		const base = {
			durationLabel: null,
			error: undefined,
			preview: "Finished",
			startedAtLabel: "Today",
			status: "success" as const,
			statusLabel: "Success",
		};
		render(
			<ExecutionHistoryView
				isLoading={false}
				labels={{ title: "History", empty: "Empty", refresh: "Refresh" }}
				records={[
					{ ...base, id: "ready", hasSession: true },
					{ ...base, id: "missing", startedAtLabel: "Yesterday", hasSession: false },
				]}
				onRefresh={vi.fn()}
				onOpenRecord={onOpenRecord}
			/>,
		);
		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: "Refresh" }));
		await user.tab();
		expect(document.activeElement).toBe(screen.getByRole("button", { name: /Today/ }));
		await user.keyboard("{Enter}");
		expect(onOpenRecord).toHaveBeenCalledExactlyOnceWith("ready");
		await user.click(screen.getByRole("button", { name: /Yesterday/ }));
		expect(onOpenRecord).toHaveBeenCalledOnce();
	});
});
