// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyInitialUserBubbleAppearance } from "./user-bubble-appearance";

const STORAGE_KEY = "vetta-user-bubble-appearance";
const root = document.documentElement;

function reset(): void {
	localStorage.removeItem(STORAGE_KEY);
	root.removeAttribute("data-user-bubble-color");
	root.removeAttribute("data-user-bubble-shape");
	root.removeAttribute("data-user-bubble-weight");
	root.style.removeProperty("--user-bubble-bg");
	root.style.removeProperty("--user-bubble-fg");
}

afterEach(reset);

describe("自定义气泡配色的持久化", () => {
	it("脏数据回落到「跟随主题」，并清掉上一轮写下的变量", () => {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ shape: "chat", color: "url(javascript:1)", weight: "medium" }),
		);
		root.style.setProperty("--user-bubble-bg", "#ff0000");
		root.style.setProperty("--user-bubble-fg", "#ffffff");

		applyInitialUserBubbleAppearance();

		expect(root.dataset.userBubbleColor).toBe("default");
		expect(root.style.getPropertyValue("--user-bubble-bg")).toBe("");
		expect(root.style.getPropertyValue("--user-bubble-fg")).toBe("");
		// 其它字段不受配色脏数据牵连。
		expect(root.dataset.userBubbleShape).toBe("chat");
		expect(root.dataset.userBubbleWeight).toBe("medium");
	});

	it("存储里的自选色重启后照样生效，并按底色给出可读的前景", () => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ shape: "default", color: "#f5cf57", weight: "default" }));

		applyInitialUserBubbleAppearance();

		expect(root.dataset.userBubbleColor).toBe("#f5cf57");
		expect(root.style.getPropertyValue("--user-bubble-bg")).toBe("#f5cf57");
		expect(root.style.getPropertyValue("--user-bubble-fg")).toBe("#1d1d1f");
	});
});
