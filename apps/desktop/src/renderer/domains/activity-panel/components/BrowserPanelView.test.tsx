// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type BrowserPanelLabels, BrowserPanelView, type BrowserPanelViewProps } from "@vetta-org/theme-ui/activity";
import { afterEach, describe, expect, it, vi } from "vitest";

const labels: BrowserPanelLabels = {
	noSession: "no-session",
	back: "back",
	forward: "forward",
	stop: "stop",
	reload: "reload",
	addressPlaceholder: "address",
	openExternal: "open-external",
	empty: "empty",
	loading: "loading",
	failed: "failed",
	retry: "retry",
};

function elementByLabel(label: string): HTMLButtonElement {
	return screen.getByRole("button", { name: label }) as HTMLButtonElement;
}

function renderView(overrides: Partial<BrowserPanelViewProps> = {}): void {
	const props: BrowserPanelViewProps = {
		workspaceId: "/work/project",
		labels,
		address: "https://example.com/",
		canBack: false,
		canForward: false,
		loading: false,
		failed: false,
		hasPage: true,
		currentUrl: "https://example.com/",
		partition: "persist:vetta-browser",
		webviewRef: () => undefined,
		onAddressChange: () => undefined,
		onAddressSubmit: () => undefined,
		onBack: () => undefined,
		onForward: () => undefined,
		onStop: () => undefined,
		onReload: () => undefined,
		onOpenExternal: () => undefined,
		onRetry: () => undefined,
		...overrides,
	};
	render(<BrowserPanelView {...props} />);
}

afterEach(cleanup);

describe("browser panel toolbar", () => {
	// 工具条必须复用设计系统的按钮组，而不是各画一套图标按钮。
	it("builds navigation and actions from the shared button groups", () => {
		renderView();
		const back = elementByLabel("back");

		expect(back.dataset.slot).toBe("button-group-item");
		expect(back.closest('[data-slot="button-group"]')?.getAttribute("role")).toBe("group");
		expect(elementByLabel("open-external").closest('[data-slot="button-group"]')).not.toBeNull();
	});

	// 地址栏自绘，但要跟按钮组同皮：全圆角胶囊、聚焦时不出现描边或焦点环。
	it("dresses the address field as a focus-silent pill", () => {
		renderView();
		const input = screen.getByPlaceholderText("address");

		expect(input.className).toContain("rounded-full");
		expect(input.className).toContain("bg-foreground/[0.06]");
		expect(input.className).toContain("outline-none");
		expect(input.className).not.toMatch(/ring|border/);
	});

	it("keeps disabled navigation disabled and forwards clicks when enabled", () => {
		const onBack = vi.fn();
		const onForward = vi.fn();
		const onReload = vi.fn();
		const onOpenExternal = vi.fn();
		renderView({ canBack: true, canForward: false, onBack, onForward, onReload, onOpenExternal });

		expect(elementByLabel("forward").disabled).toBe(true);
		fireEvent.click(elementByLabel("forward"));
		expect(onForward).not.toHaveBeenCalled();

		fireEvent.click(elementByLabel("back"));
		fireEvent.click(elementByLabel("reload"));
		fireEvent.click(elementByLabel("open-external"));
		expect(onBack).toHaveBeenCalledTimes(1);
		expect(onReload).toHaveBeenCalledTimes(1);
		expect(onOpenExternal).toHaveBeenCalledTimes(1);
	});

	it("swaps reload for stop while loading and disables opening without a page", () => {
		renderView({ loading: true, currentUrl: "" });

		expect(screen.queryByRole("button", { name: "reload" })).toBeNull();
		expect(elementByLabel("stop")).toBeTruthy();
		expect(elementByLabel("open-external").disabled).toBe(true);
		expect(screen.getByText("loading")).toBeTruthy();
	});

	it("submits the typed address through the form", () => {
		const onAddressChange = vi.fn();
		const onAddressSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
		renderView({ onAddressChange, onAddressSubmit });

		const input = screen.getByPlaceholderText("address");
		fireEvent.change(input, { target: { value: "https://example.com/b" } });
		expect(onAddressChange).toHaveBeenCalledWith("https://example.com/b");

		fireEvent.submit(input.closest("form") as HTMLFormElement);
		expect(onAddressSubmit).toHaveBeenCalledTimes(1);
	});
});

describe("browser panel states", () => {
	it("shows the empty state until a page is loaded", () => {
		renderView({ hasPage: false, currentUrl: "" });
		expect(screen.getByText("empty")).toBeTruthy();
		expect(elementByLabel("open-external").disabled).toBe(true);
	});

	it("offers retry in the failed state", () => {
		const onRetry = vi.fn();
		renderView({ failed: true, onRetry });

		expect(screen.getByText("failed")).toBeTruthy();
		fireEvent.click(elementByLabel("retry"));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("shows the no-session hint without a workspace", () => {
		renderView({ workspaceId: null });
		expect(screen.getByText("no-session")).toBeTruthy();
		expect(screen.queryByPlaceholderText("address")).toBeNull();
	});
});
