// @vitest-environment jsdom
/**
 * 对话页背景：设置里选了哪档，页面就铺哪档。
 *
 * 这里串的是「设置值 → 页面实际画出来的东西」这一段：纹路组件挂在根节点最底层，
 * 选「无」时整层不渲染，选「涂鸦」时铺一层内联 svg。别的子面板都 mock 掉，
 * 断言只关心背景这一层。
 */
import { chatBackgroundAtom } from "@shared/store/atoms";
import { render } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { DefaultChatView } from "./DefaultChatView";
import type { ChatBackgroundId } from "@shared/theme/chat-background";

const workspace = { id: "conversation:test", cwd: null, runtimeIds: [] };

vi.mock("@domains/activity-panel/components/ActivityPanel", () => ({
	ActivityPanel: () => createElement("aside", { "data-testid": "activity-panel" }),
	CurrentScenarioActivityPanel: () => createElement("aside", { "data-testid": "activity-panel" }),
}));

vi.mock("@domains/bottom-panel/components/BottomPanelHost", () => ({
	BottomPanelHost: () => createElement("section", { "data-testid": "bottom-panel" }),
}));

vi.mock("../ChatExportHost", () => ({
	ChatExportHost: () => null,
}));

function renderWithBackground(backgroundId: ChatBackgroundId) {
	const store = createStore();
	store.set(chatBackgroundAtom, backgroundId);
	return render(
		<Provider store={store}>
			<DefaultChatView messages={[]} workspace={workspace} workSurface={null}>
				<div data-testid="message-list" />
			</DefaultChatView>
		</Provider>,
	);
}

describe("DefaultChatView 聊天背景", () => {
	it("选「无」时根节点不铺任何纹路", () => {
		const view = renderWithBackground("none");

		expect(view.container.querySelector("svg")).toBeNull();
	});

	it("选「涂鸦」时铺一层内联 svg，且垫在内容下面", () => {
		const view = renderWithBackground("doodle");

		const backdrop = view.container.querySelector("svg");
		expect(backdrop).not.toBeNull();
		// 背景整层不参与命中与读屏，只是纹路。
		const layer = backdrop?.closest("[aria-hidden]") as HTMLElement;
		expect(layer.className).toContain("pointer-events-none");
		expect(layer.className).toContain("absolute");
		// 在 DOM 顺序上排在消息内容之前 = 画在内容下面。
		const messageList = view.getByTestId("message-list");
		expect(layer.compareDocumentPosition(messageList) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
