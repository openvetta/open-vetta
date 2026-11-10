// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	InputBarAttachmentActions,
	InputBarSendAction,
	InputBarSpeechAction,
} from "./InputBarToolbar";
import { InputBarLeadingActions } from "./InputBarToolbarActions";
import type { InputBarModel } from "./types";

vi.mock("./InputBarToolbarButton", () => ({
	InputBarToolbarButton: ({ title, onClick }: { title: string; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{title}
		</button>
	),
}));
vi.mock("../SendButton", () => ({
	SendButton: ({ onSend }: { onSend: () => void }) => (
		<button type="button" onClick={onSend}>
			Send
		</button>
	),
}));
vi.mock("../ExecutionModeSelector", () => ({
	ExecutionModeSelector: () => <div data-testid="execution-mode" />,
}));
vi.mock("./ActiveActionCapsules", () => ({
	ActiveActionCapsules: ({ items }: { items: readonly { id: string }[] }) => (
		<div data-testid="active-capsules">{items.map((item) => item.id).join(",")}</div>
	),
}));

afterEach(cleanup);

describe("InputBar toolbar abilities", () => {
	it("keeps image and file attachment actions independently callable", () => {
		const onSelectImages = vi.fn();
		const onSelectFiles = vi.fn();
		render(
			<InputBarAttachmentActions
				disabled={false}
				visible
				addImageTitle="Add image"
				attachFileTitle="Attach file"
				onSelectImages={onSelectImages}
				onSelectFiles={onSelectFiles}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Add image" }));
		fireEvent.click(screen.getByRole("button", { name: "Attach file" }));
		expect(onSelectImages).toHaveBeenCalledOnce();
		expect(onSelectFiles).toHaveBeenCalledOnce();
	});

	it("renders speech input only when that ability is available", () => {
		const onToggle = vi.fn();
		const input = {
			visible: false,
			active: false,
			disabled: false,
			title: "Dictate",
			statusText: null,
			onToggle,
		};
		const view = render(<InputBarSpeechAction input={input} />);
		expect(screen.queryByRole("button", { name: "Dictate" })).toBeNull();

		view.rerender(<InputBarSpeechAction input={{ ...input, visible: true }} />);
		fireEvent.click(screen.getByRole("button", { name: "Dictate" }));
		expect(onToggle).toHaveBeenCalledOnce();
	});

	it("preserves queue and normal send actions as separate states", () => {
		const onSend = vi.fn();
		const view = render(
			<InputBarSendAction
				canSend
				isEmpty={false}
				isStreaming
				queueTitle="Queue"
				onAbort={vi.fn()}
				onSend={onSend}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Queue" }));
		expect(onSend).toHaveBeenCalledOnce();

		view.rerender(
			<InputBarSendAction
				canSend
				isEmpty
				isStreaming={false}
				queueTitle="Queue"
				onAbort={vi.fn()}
				onSend={onSend}
			/>,
		);
		expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
	});
});

describe("InputBar leading toolbar divider", () => {
	const EXECUTION_MODE_TOOL = [{ kind: "execution-mode", model: {} }] as unknown as InputBarModel["leadingTools"];

	/** 只填 InputBarLeadingActions 真正读到的字段，其余由类型断言补齐。 */
	function leadingModel({
		slashOpen = false,
		executionModeInModelMenu,
		leadingTools = [],
		activeActions = [],
	}: {
		readonly slashOpen?: boolean;
		readonly executionModeInModelMenu?: boolean;
		readonly leadingTools?: InputBarModel["leadingTools"];
		readonly activeActions?: InputBarModel["activeActions"];
	} = {}): InputBarModel {
		return {
			hasSession: true,
			commands: { slashOpen, onOpen: vi.fn() },
			activeActions,
			leadingTools,
			executionModeInModelMenu,
			labels: {
				toolbar: { skills: "Skills", addImage: "Add image", attachFile: "Attach file", queue: "Queue" },
				capsule: { removeDefault: "Remove", activeGroup: (count: number) => `${count} active` },
			},
			actions: { handleSelectFiles: vi.fn(), handleSelectImages: vi.fn() },
		} as unknown as InputBarModel;
	}

	it("draws no divider when the command panel is closed and the sandbox picker moved into the model menu", () => {
		const { container } = render(
			<InputBarLeadingActions model={leadingModel({ executionModeInModelMenu: true, leadingTools: EXECUTION_MODE_TOOL })} />,
		);

		expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
		expect(container.querySelector("[data-input-bar-divider]")).toBeNull();
	});

	it("keeps the divider when an active capsule is the only thing on the right", () => {
		const { container } = render(
			<InputBarLeadingActions
				model={leadingModel({
					executionModeInModelMenu: true,
					leadingTools: EXECUTION_MODE_TOOL,
					activeActions: [{ id: "plan-mode", label: "Plan mode", onToggle: vi.fn() }],
				})}
			/>,
		);

		expect(screen.getByTestId("active-capsules").textContent).toBe("plan-mode");
		expect(container.querySelector("[data-input-bar-divider]")).not.toBeNull();
	});

	it("keeps the divider while the command panel shows the attachment actions", () => {
		const { container } = render(
			<InputBarLeadingActions
				model={leadingModel({
					executionModeInModelMenu: true,
					slashOpen: true,
				})}
			/>,
		);

		expect(screen.getByRole("button", { name: "Attach file" })).toBeTruthy();
		expect(container.querySelector("[data-input-bar-divider]")).not.toBeNull();
	});

	it("keeps the divider for the team composer that still hosts the sandbox picker", () => {
		const { container } = render(
			<InputBarLeadingActions model={leadingModel({ leadingTools: EXECUTION_MODE_TOOL })} />,
		);

		expect(screen.getByTestId("execution-mode")).toBeTruthy();
		expect(container.querySelector("[data-input-bar-divider]")).not.toBeNull();
	});
});
