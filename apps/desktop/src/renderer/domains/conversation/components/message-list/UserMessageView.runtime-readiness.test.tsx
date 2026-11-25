// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { createConversationUserMessage } from "@shared/conversation";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const onEdit = vi.fn();
const onFork = vi.fn();
const onBranchNext = vi.fn();

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) =>
			({
				"messageList.editButton": "edit",
				"messageList.forkButton": "fork",
				"messageList.branch.prev": "previous",
				"messageList.branch.next": "next",
			})[key] ?? key,
	}),
}));
vi.mock("../../hooks/useSkillTokenMeta", () => ({ useSkillTokenMeta: () => vi.fn() }));

import { createConversationFeed, ConversationFeedContext, type UserMessageCommands } from "../../conversation-view/feed";
import { ConversationMessageScope } from "../../conversation-view/message-scope";
import { SessionUserMessage } from "../../session-conversation/SessionUserMessage";
import { atom } from "jotai";
import { UserMessage } from "./UserMessage";
import { TokenChip } from "../input-bar/editor/nodes/TokenChip";

beforeAll(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe(): void {}
			disconnect(): void {}
		},
	);
});

afterAll(() => vi.unstubAllGlobals());

const commands: UserMessageCommands = {
	useEdit: () => ({ available: true, pending: false, onEdit }),
	useHistory: () => ({
		branchIndex: 0,
		branchTotal: 2,
		canSwitch: true,
		forkAvailable: true,
		onFork,
		onNext: onBranchNext,
		onPrevious: vi.fn(),
	}),
	useDelete: () => ({ available: false, onDelete: vi.fn() }),
};

it("Runtime 恢复期间消息操作保持可用并立即接受点击", async () => {
	const user = userEvent.setup();
	const message = createConversationUserMessage({ id: "user-1", text: "message" });
	const feed = createConversationFeed({
		key: "session",
		items: atom([message]),
		workspace: { id: "/repo", cwd: "/repo", runtimeIds: [] },
		capabilities: { userMessageCommands: commands },
	});
	render(
		<ConversationFeedContext.Provider value={feed}>
			<ConversationMessageScope row={{ message, index: 0, isTail: true, isLastUserMessage: true }}>
				<SessionUserMessage />
			</ConversationMessageScope>
		</ConversationFeedContext.Provider>,
	);

	expect((screen.getByLabelText("edit") as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByLabelText("fork") as HTMLButtonElement).disabled).toBe(false);
	expect((screen.getByLabelText("previous") as HTMLButtonElement).disabled).toBe(true);
	expect((screen.getByLabelText("next") as HTMLButtonElement).disabled).toBe(false);
	const outgoing = document.querySelector("[data-message-layout='outgoing']");
	expect(outgoing?.className).toContain("justify-end");

	await user.click(screen.getByLabelText("edit"));
	await user.click(screen.getByLabelText("fork"));
	await user.click(screen.getByLabelText("next"));
	expect(onEdit).toHaveBeenCalledOnce();
	expect(onFork).toHaveBeenCalledOnce();
	expect(onBranchNext).toHaveBeenCalledOnce();
});

it("已发送的成员 mention 复用输入框 Token 并使用深浅模式语义色", () => {
	const { container } = render(
		<>
			<TokenChip label="@Architect" title="composer-token" tone="member" />
			<UserMessage
				message={{
					...createConversationUserMessage({ id: "user-mention", text: "**请** @architect 你好" }),
					memberMentions: [{ participantId: "architect", handle: "architect", start: 6, end: 16 }],
				}}
				participants={[
					{
						id: "architect",
						kind: "agent",
						name: "Architect",
						handle: "architect",
						avatar: "./architect.webp",
					},
				]}
			/>
		</>,
	);

	expect(screen.getAllByText("@Architect")).toHaveLength(2);
	expect(screen.getByTitle("Architect · @architect").querySelector("img")?.getAttribute("src")).toBe(
		"./architect.webp",
	);
	const tokens = container.querySelectorAll<HTMLElement>("[data-inline-token='true']");
	expect(tokens).toHaveLength(2);
	expect(tokens[1]?.className).toBe(tokens[0]?.className);
	expect(tokens[1]?.className).toContain("text-primary");
	expect(tokens[1]?.className).not.toContain("sky-");
	expect(screen.getByText("请").tagName).toBe("STRONG");
});

it("长消息展开后移除气泡底部的渐变和按钮", async () => {
	const scrollHeight = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(900);
	const clientHeight = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(320);
	try {
		const user = userEvent.setup();
		render(<UserMessage message={createConversationUserMessage({ id: "long-message", text: "长消息\n\n".repeat(50) })} />);
		const expand = await screen.findByRole("button", { name: "messageList.userMessage.expand" });
		const fade = expand.closest("[data-user-message-expand-fade]");
		expect(fade?.closest('[data-message-visual="outgoingbubble"]')).toBeTruthy();
		await user.click(expand);
		expect(fade?.isConnected).toBe(false);
		expect(screen.getAllByText("长消息")).toHaveLength(50);
	} finally {
		scrollHeight.mockRestore();
		clientHeight.mockRestore();
	}
});

it("图片附件与随附正文留出间距，只有正文时不增加顶部留白", () => {
	const withImage = createConversationUserMessage({
		id: "with-image",
		text: "随附正文",
		attachments: [{ kind: "image", path: "/workspace/example.png" }],
	});
	const { rerender } = render(<UserMessage message={withImage} />);
	const bubble = screen.getByText("随附正文").closest('[data-message-visual="outgoingbubble"]');
	expect(screen.getByRole("img")).toBeTruthy();
	expect(bubble?.parentElement?.classList.contains("mt-2")).toBe(true);

	rerender(<UserMessage message={createConversationUserMessage({ id: "text-only", text: "只有正文" })} />);
	const textOnly = screen.getByText("只有正文").closest('[data-message-visual="outgoingbubble"]');
	expect(textOnly?.parentElement?.classList.contains("mt-2")).toBe(false);
});

it("带图片的消息，侧边操作按钮只对准正文气泡居中，不把图片算进去", () => {
	const withImage = createConversationUserMessage({
		id: "actions-with-image",
		text: "看这张图",
		attachments: [{ kind: "image", path: "/workspace/example.png" }],
	});
	const { rerender } = render(
		<UserMessage message={withImage}>
			<div data-testid="side-actions" />
		</UserMessage>,
	);
	const anchor = screen.getByTestId("side-actions").parentElement;
	expect(anchor?.classList.contains("relative")).toBe(true);
	expect(anchor?.contains(screen.getByText("看这张图"))).toBe(true);
	expect(anchor?.contains(screen.getByRole("img"))).toBe(false);

	rerender(
		<UserMessage
			message={createConversationUserMessage({
				id: "image-only",
				text: "",
				attachments: [{ kind: "image", path: "/workspace/example.png" }],
			})}
		>
			<div data-testid="side-actions" />
		</UserMessage>,
	);
	expect(screen.getByTestId("side-actions").parentElement?.contains(screen.getByRole("img"))).toBe(true);
});

it("发送包含正文、表格和代码的 Markdown 时，富内容保留独立的主题面板", () => {
	render(
		<UserMessage
			message={createConversationUserMessage({
				id: "rich-markdown",
				text: "正文 **强调**\n\n| 指标 | 值 |\n| --- | --- |\n| 人数 | **42** |\n\n```text\nexample\n```",
			})}
		/>,
	);

	const prose = screen.getByText("强调");
	const bubble = prose.closest('[data-message-visual="outgoingbubble"]');
	const tableFrame = screen.getByRole("table").closest("[data-md-table-frame]");
	const codeFrame = screen.getByText("example").closest("[data-md-code-frame]");
	expect(tableFrame && bubble?.contains(tableFrame)).toBe(true);
	expect(codeFrame && bubble?.contains(codeFrame)).toBe(true);
	expect(screen.getByText("42").closest("[data-md-table-frame]")).toBe(tableFrame);
	expect(prose.closest("[data-md-table-frame], [data-md-code-frame]")).toBeNull();
});

it("普通 Markdown 中手敲的 @handle 不会被猜测为成员 Token", () => {
	const { container } = render(
		<UserMessage
			message={createConversationUserMessage({ id: "plain-at", text: "**请** @architect 你好" })}
			participants={[{ id: "architect", kind: "agent", name: "Architect", handle: "architect" }]}
		/>,
	);

	expect(container.querySelector("[data-inline-token='true']")).toBeNull();
	expect(screen.getByText("@architect 你好")).toBeTruthy();
});

it("发送前选择为普通文件的 png 在消息气泡中仍显示文件 Token", () => {
	const path = "C:/workspace/screenshot.png";
	const { container } = render(
		<UserMessage
			message={createConversationUserMessage({
				id: "png-file",
				text: `检查 @${path} 然后调整`,
				inputSegments: [
					{ kind: "text", text: "检查 " },
					{ kind: "file", path },
					{ kind: "text", text: " 然后调整" },
				],
				attachments: [{ kind: "file", path }],
			})}
		/>,
	);

	expect(screen.getByTitle(path).textContent).toContain("screenshot.png");
	expect(container.querySelectorAll("[data-inline-token='true']")).toHaveLength(1);
	expect(container.querySelector("img")).toBeNull();
});

it("结构化快照中的普通正文不会在 Markdown 层被二次识别", () => {
	const text = "原样保留 @C:/workspace/screenshot.png";
	const { container } = render(
		<UserMessage
			message={createConversationUserMessage({
				id: "plain-token-shape",
				text,
				inputSegments: [{ kind: "text", text }],
			})}
		/>,
	);

	expect(container.querySelector("[data-inline-token='true']")).toBeNull();
	expect(screen.getByText(text)).toBeTruthy();
});

it("本地 Markdown 链接规范化后仍按原始编辑器区间渲染相邻 Token", () => {
	const prefix = "[文档](C:/My Files/spec.md) ";
	const text = `${prefix}@skill:review`;
	const { container } = render(
		<UserMessage
			message={createConversationUserMessage({
				id: "link-before-token",
				text,
				inputSegments: [
					{ kind: "text", text: prefix },
					{ kind: "skill", name: "review" },
				],
			})}
		/>,
	);

	expect(screen.getByTitle("review").textContent).toContain("review");
	expect(container.querySelectorAll("[data-inline-token='true']")).toHaveLength(1);
});
