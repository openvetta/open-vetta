// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../hooks/useToasterModel", () => ({
	useToasterModel: () => ({
		closeTitle: "close",
		onAction: vi.fn(),
		onDismiss: vi.fn(),
		toasts: [{ id: "t1", message: "Invalid API key", variant: "error" }],
	}),
}));

import { Toaster } from "./Toaster";

describe("Toaster", () => {
	it("提示挂到 body 上，不被应用框架的层叠上下文困住、能盖过打开的弹窗", () => {
		const { container } = render(
			<div className="isolate">
				<Toaster />
			</div>,
		);

		const message = screen.getByText("Invalid API key");
		expect(container.contains(message)).toBe(false);
		expect(document.body.contains(message)).toBe(true);
	});
});
