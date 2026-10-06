// @vitest-environment jsdom

import { RendererMarkdownScope } from "@shared/components/RendererMarkdownScope";
import type { ConversationAgentMessageViewModel } from "@shared/conversation";
import { createConversationAgentMessage, createConversationUserMessage } from "@shared/conversation";
import { useRendererMarkdownModel } from "@shared/hooks/useRendererMarkdownModel";
import { i18n, initI18n } from "@shared/i18n";
import { activityPanelOpenAtom, activityPanelWidthAtom, filePreviewAtom } from "@shared/store/atoms";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageExpansionScope } from "./expansionStore";
import { ExportMessageList, MessageItem } from "./MessageItem";

const html =
	'<!doctype html><html lang="zh"><head><style>body{font-family:system-ui}</style></head><body><h1>主会话内的回答</h1><details><summary>展开依据</summary>本地示例</details></body></html>';
const text = `说明在 HTML 上方\n\n\`\`\`html-preview\n${html}\n\`\`\`\n\n结论在 HTML 下方`;
function message(blocks: boolean, phase: "completed" | "streaming" = "completed") {
	return createConversationAgentMessage({
		id: "inline-answer",
		text,
		phase,
		blocks: blocks ? [{ id: "answer-text", type: "text", text }] : [],
	});
}
function MainReply({
	item,
	streaming = false,
	exportMode = false,
}: {
	item: ConversationAgentMessageViewModel;
	streaming?: boolean;
	exportMode?: boolean;
}) {
	const markdown = useRendererMarkdownModel(null, true, "offline-main-conversation");
	return (
		<main aria-label="主会话消息">
			<RendererMarkdownScope value={markdown}>
				<MessageExpansionScope scope="offline-main-conversation">
					<MessageItem message={item} isStreaming={streaming} isTailMessage exportMode={exportMode} />
				</MessageExpansionScope>
			</RendererMarkdownScope>
		</main>
	);
}
beforeEach(() => {
	initI18n();
	void i18n.changeLanguage("zh");
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe() {}
			disconnect() {}
		},
	);
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: vi.fn(async () => undefined) },
	});
});
afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe("main conversation inline HTML", () => {
	it.each([true, false])(
		"renders assistant HTML between its prose with sidebar closed (structured blocks=%s)",
		async (blocks) => {
			const store = createStore();
			store.set(activityPanelOpenAtom, false);
			store.set(activityPanelWidthAtom, 260);
			const renderReply = () => (
				<Provider store={store}>
					<MainReply item={message(blocks)} />
				</Provider>
			);
			const view = render(renderReply());
			const main = screen.getByRole("main", { name: "主会话消息" });
			const frame = within(main).getByTitle("HTML 回答");
			expect(frame.tagName).toBe("IFRAME");
			expect(frame.getAttribute("srcdoc")).toContain("主会话内的回答");
			expect(within(main).getByText("说明在 HTML 上方")).toBeTruthy();
			expect(within(main).getByText("结论在 HTML 下方")).toBeTruthy();
			expect(main.querySelectorAll("iframe")).toHaveLength(1);
			const card = within(main).getByRole("region", { name: "HTML 回答" });
			fireEvent.click(within(card).getByRole("button", { name: "源码" }));
			expect(frame.closest("[hidden]")).not.toBeNull();
			fireEvent.click(within(card).getByRole("button", { name: "复制" }));
			await within(card).findByRole("button", { name: "已复制" });
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(html);
			fireEvent.click(within(card).getByRole("button", { name: "预览" }));
			expect(within(main).getByTitle("HTML 回答")).toBe(frame);
			fireEvent.click(within(card).getByRole("button", { name: "增高回答" }));
			expect(store.get(activityPanelOpenAtom)).toBe(false);
			expect(store.get(activityPanelWidthAtom)).toBe(260);
			expect(store.get(filePreviewAtom)).toBeNull();
			view.unmount();
			render(renderReply());
			expect(screen.getByRole("main").querySelectorAll("iframe")).toHaveLength(1);
			expect(store.get(activityPanelOpenAtom)).toBe(false);
		},
	);

	it.each([true, false])("waits for completed reply before displaying inline HTML (structured blocks=%s)", (blocks) => {
		vi.useFakeTimers();
		const store = createStore();
		const view = render(
			<Provider store={store}>
				<MainReply item={message(blocks, "streaming")} streaming />
			</Provider>,
		);
		act(() => vi.advanceTimersByTime(5000));
		expect(view.container.querySelector("iframe")).toBeNull();
		view.rerender(
			<Provider store={store}>
				<MainReply item={message(blocks)} />
			</Provider>,
		);
		expect(screen.getByRole("main").querySelectorAll("iframe")).toHaveLength(1);
	});
	it("waits for the whole reply even when HTML is in an earlier completed text block", () => {
		vi.useFakeTimers();
		const first = { id: "html", type: "text" as const, text };
		const last = { id: "tail", type: "text" as const, text: "Still explaining" };
		const item = createConversationAgentMessage({ id: "two-blocks", blocks: [first, last], phase: "streaming" });
		const store = createStore();
		const view = render(
			<Provider store={store}>
				<MainReply item={item} streaming />
			</Provider>,
		);
		act(() => vi.advanceTimersByTime(5000));
		expect(view.container.querySelector("iframe")).toBeNull();
		view.rerender(
			<Provider store={store}>
				<MainReply item={{ ...item, phase: "completed" }} />
			</Provider>,
		);
		expect(screen.getByRole("main").querySelectorAll("iframe")).toHaveLength(1);
	});

	it.each([true, false])("exports readable source instead of live preview controls (structured blocks=%s)", (blocks) => {
		const view = render(
			<Provider store={createStore()}>
				<MainReply item={message(blocks)} exportMode />
			</Provider>,
		);
		expect(view.container.querySelector("iframe")).toBeNull();
		expect(view.container.textContent).toContain(html);
		expect(screen.queryByRole("button", { name: "预览" })).toBeNull();
	});
	it("exports both user and assistant HTML as source across the whole export subtree", () => {
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				skills: { list: async () => [] },
				abilities: { listOpenMarketplaces: async () => ({ abilities: [] }) },
			},
		});
		const user = createConversationUserMessage({ id: "user-html", text });
		const view = render(
			<Provider store={createStore()}>
				<ExportMessageList messages={[user, message(true)]} />
			</Provider>,
		);
		expect(view.container.querySelector("iframe")).toBeNull();
		expect(view.container.textContent?.split(html)).toHaveLength(3);
		expect(screen.queryByRole("button", { name: "预览" })).toBeNull();
	});
});
