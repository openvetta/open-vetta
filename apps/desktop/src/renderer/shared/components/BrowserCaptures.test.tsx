// @vitest-environment jsdom
import { browserCapturesAtom } from "@shared/store/atoms";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getDefaultStore } from "jotai";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserCaptureDraftCards } from "./BrowserCaptures";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const capture = {
	version: 1 as const,
	id: "shot",
	imagePath: "/cache/shot.png",
	title: "Home",
	url: "https://example.test",
	mode: "region" as const,
	width: 60,
	height: 40,
	viewport: { width: 60, height: 40 },
	rect: { x: 0, y: 0, width: 60, height: 40 },
	note: "Align the title",
};

beforeEach(() => {
	getDefaultStore().set(browserCapturesAtom, [capture]);
});
afterEach(() => {
	cleanup();
	getDefaultStore().set(browserCapturesAtom, []);
});

it.each(["browserCapture.cancel", "browserCapture.save"])(
	"关闭截图说明浮层（%s）后键盘焦点回到对应缩略图",
	async (closeLabel) => {
		render(<BrowserCaptureDraftCards />);
		const thumbnail = screen.getByTitle("Home");
		thumbnail.focus();
		fireEvent.click(thumbnail);
		expect(screen.getByRole("dialog")).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: closeLabel }));

		expect(screen.queryByRole("dialog")).toBeNull();
		// Radix 在浮层卸载后的下一个任务里归还焦点。
		await waitFor(() => expect(document.activeElement).toBe(screen.getByTitle("Home")));
	},
);

it("在浮层里修改说明并保存后，草稿中的截图带上新说明", () => {
	render(<BrowserCaptureDraftCards />);
	fireEvent.click(screen.getByTitle("Home"));
	fireEvent.change(screen.getByRole("textbox"), { target: { value: "Fix the header" } });
	fireEvent.click(screen.getByRole("button", { name: "browserCapture.save" }));

	expect(getDefaultStore().get(browserCapturesAtom)).toEqual([{ ...capture, note: "Fix the header" }]);
});
