// @vitest-environment jsdom
/**
 * 聊天背景选择的读写与目录/实现表的对齐：这两件事决定对话页开页时铺什么，
 * 脏值与新增档位最容易在这里出错。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
	CHAT_BACKGROUND_CATALOG,
	CHAT_BACKGROUND_COMPONENTS,
	DEFAULT_CHAT_BACKGROUND_ID,
	getStoredChatBackgroundId,
	isChatBackgroundId,
	setStoredChatBackgroundId,
} from "./chat-background";

beforeEach(() => {
	window.localStorage.clear();
});

describe("聊天背景", () => {
	it("没选过时是「无」，选过之后读回选的那档", () => {
		expect(getStoredChatBackgroundId()).toBe("none");
		expect(DEFAULT_CHAT_BACKGROUND_ID).toBe("none");

		setStoredChatBackgroundId("doodle");

		expect(getStoredChatBackgroundId()).toBe("doodle");
	});

	it("存了别处写进来的脏值时回落到「无」，而不是画不出东西", () => {
		window.localStorage.setItem("vetta-chat-background", "not-a-background");

		expect(isChatBackgroundId("not-a-background")).toBe(false);
		expect(getStoredChatBackgroundId()).toBe("none");
	});

	it("目录与实现表逐项对齐：漏挂组件的那档在设置页点得到却画不出东西", () => {
		for (const entry of CHAT_BACKGROUND_CATALOG) {
			expect(entry.id in CHAT_BACKGROUND_COMPONENTS).toBe(true);
		}
		expect(Object.keys(CHAT_BACKGROUND_COMPONENTS).sort()).toEqual(
			CHAT_BACKGROUND_CATALOG.map((entry) => entry.id).sort(),
		);
		// 「无」是唯一不画东西的一档。
		expect(CHAT_BACKGROUND_COMPONENTS.none).toBeNull();
		expect(CHAT_BACKGROUND_COMPONENTS.doodle).not.toBeNull();
	});
});
