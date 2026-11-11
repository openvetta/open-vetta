// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ConfirmDialogView } from "@vetta-org/theme-ui/overlays/ConfirmDialogView";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function setup(variant?: "danger" | "default") {
	const onCancel = vi.fn();
	const onConfirm = vi.fn();
	const view = render(
		<ConfirmDialogView
			labels={{ cancel: "取消", confirm: "确定" }}
			overlayRef={createRef<HTMLDivElement>()}
			state={{ title: "移除 OpenAI？", message: "此操作无法撤销。", confirmLabel: "移除", variant }}
			onCancel={onCancel}
			onConfirm={onConfirm}
			onCheckboxCheckedChange={vi.fn()}
		/>,
	);
	return { view, onCancel, onConfirm };
}

describe("ConfirmDialogView", () => {
	it("shows the title and message and wires the two buttons", () => {
		const { view, onCancel, onConfirm } = setup("danger");

		expect(view.getByText("移除 OpenAI？")).toBeTruthy();
		expect(view.getByText("此操作无法撤销。")).toBeTruthy();
		fireEvent.click(view.getByText("取消"));
		expect(onCancel).toHaveBeenCalledTimes(1);
		expect(onConfirm).not.toHaveBeenCalled();
		fireEvent.click(view.getByText("移除"));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("uses the destructive style only for the danger variant", () => {
		const danger = setup("danger");
		expect(danger.view.getByText("移除").className).toContain("bg-destructive");
		cleanup();
		const normal = setup("default");
		expect(normal.view.getByText("移除").className).toContain("bg-primary");
	});

	it("has no outer border and keeps the divider only above the action bar", () => {
		const { view } = setup();
		const panel = view.getByText("移除 OpenAI？").closest(".rounded-2xl");
		expect(panel?.className).not.toContain("border");
		expect(view.getByText("取消").parentElement?.className).toContain("border-t");
	});
});
