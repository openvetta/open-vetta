// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuestionPanelView } from "./QuestionPanelView";
import type { QuestionPanelLabels, QuestionPanelViewProps } from "./types";

afterEach(cleanup);

const labels: QuestionPanelLabels = {
	title: "Vetta needs your choice",
	questionTabLabel: (number) => `Question ${number}`,
	keyboardHint: "↑↓ Navigate · Space select",
	cancel: "Cancel",
	collapse: "Collapse panel",
	expand: "Expand panel",
	next: "Next",
	submit: "Submit",
	multiSelectHint: "Multiple choice",
	otherOption: "Other (custom input)",
	otherPlaceholder: "Type your answer…",
};

function props(overrides: Partial<QuestionPanelViewProps> = {}): QuestionPanelViewProps {
	return {
		pending: {
			requestId: "req-1",
			sessionId: "session-1",
			questions: [
				{
					question: "Where should the Git actions live?",
					header: "Scope",
					options: [
						{ label: "Bubble", description: "Everything into the input bubble." },
						{ label: "Panel", description: "Keep them on the side panel." },
					],
				},
				{
					question: "How much goes into the popover?",
					header: "Depth",
					options: [{ label: "Status only", description: "Read-only summary." }],
				},
			],
		},
		labels,
		onSubmitAnswers: vi.fn(),
		onCancel: vi.fn(),
		...overrides,
	};
}

describe("QuestionPanelView collapse", () => {
	it("keeps only the header while collapsed and restores the whole question on expand", async () => {
		const user = userEvent.setup();
		render(<QuestionPanelView {...props()} />);

		await user.click(screen.getByRole("button", { name: /Bubble/ }));

		await user.click(screen.getByRole("button", { name: "Collapse panel" }));

		// 折叠后仍能看到进度与当前问题，背后内容不再被整块挡住。
		expect(screen.getByText("Vetta needs your choice")).toBeTruthy();
		expect(screen.getByText(/1\/2/)).toBeTruthy();
		expect(screen.getByRole("button", { name: "Expand panel" }).getAttribute("aria-expanded")).toBe("false");
		await waitFor(() => expect(screen.queryByRole("button", { name: /^Panel/ })).toBeNull());
		expect(screen.queryByRole("button", { name: "Next" })).toBeNull();

		await user.click(screen.getByRole("button", { name: "Expand panel" }));

		expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
		// 折叠不丢已选答案：进度仍是 1/2，第一题的选项保持选中。
		expect(screen.getByText(/1\/2/)).toBeTruthy();
		expect(screen.getByRole("button", { name: /Bubble/ })).toBeTruthy();

		await user.click(screen.getByRole("button", { name: "Next" }));
		expect(await screen.findByText("How much goes into the popover?")).toBeTruthy();
	});

	it("re-expands for the next question request", async () => {
		const user = userEvent.setup();
		const view = render(<QuestionPanelView {...props()} />);

		await user.click(screen.getByRole("button", { name: "Collapse panel" }));
		await waitFor(() => expect(screen.queryByRole("button", { name: "Next" })).toBeNull());

		view.rerender(<QuestionPanelView {...props({ pending: { ...props().pending, requestId: "req-2" } })} />);

		// 新请求不应继承上一题的收起状态。
		expect(screen.getByRole("button", { name: "Collapse panel" })).toBeTruthy();
		expect(await screen.findByRole("button", { name: /Bubble/ })).toBeTruthy();
	});

	it("stops swallowing option keystrokes once collapsed", async () => {
		const user = userEvent.setup();
		render(<QuestionPanelView {...props()} />);

		await user.click(screen.getByRole("button", { name: "Collapse panel" }));

		// 面板收起时容器仍持有键盘焦点，方向键/空格不能再改选项。
		const container = screen.getByText("Vetta needs your choice").closest("[tabindex='-1']") as HTMLElement;
		container.focus();
		fireEvent.keyDown(container, { key: " " });
		fireEvent.keyDown(container, { key: "ArrowDown" });
		fireEvent.keyDown(container, { key: " " });

		await user.click(screen.getByRole("button", { name: "Expand panel" }));
		expect(screen.getByText(/0\/2/)).toBeTruthy();
	});
});
