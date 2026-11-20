import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageFeedLayoutVirtualizer } from "./MessageFeedLayoutView";
import { MessageFeedRoot } from "./MessageFeedView";

const fadeCss = readFileSync(join(import.meta.dirname, "message-feed-fade.css"), "utf8");

/** 取出某个选择器的第一条规则体。 */
function ruleBody(css: string, selector: string): string {
	const start = css.indexOf(`${selector} {`);
	expect(start, `missing rule for ${selector}`).toBeGreaterThanOrEqual(0);
	return css.slice(start, css.indexOf("}", start));
}

const overlayBody = ruleBody(fadeCss, '[data-header-overlay="true"] .message-feed-fade');

describe("message feed edge fade", () => {
	it("puts the fade class on the scroller itself, where the scrollbar is painted", () => {
		const markup = renderToStaticMarkup(
			<MessageFeedRoot>
				<MessageFeedLayoutVirtualizer />
			</MessageFeedRoot>,
		);
		expect(markup).toContain("message-feed-fade");
		expect(markup).toContain('data-message-feed-layout-part="virtualizer"');
	});

	/**
	 * mask 会在绘制阶段连滚动条一起淡出，滚动条无法用 z-index 抬上来（这是滚动条首尾
	 * 被吃掉的原因）；但整条槽位恒不透明又会让滑块顶进沉浸式顶栏。三层合成同时解掉两件事：
	 * 槽位列 ∩ 槽位纵向轮廓，再与内容渐隐相加。
	 */
	it("composites content fade, scrollbar column and gutter profile in that order", () => {
		const body = ruleBody(fadeCss, ".message-feed-fade");
		const maskImage = body.slice(body.indexOf("mask-image:"), body.indexOf("mask-composite"));
		expect(body).toContain("mask-composite: add, intersect, intersect;");

		// 后写的层先画：内容渐隐在最上（add 回去），槽位列与轮廓依次在下。
		expect(maskImage.indexOf("var(--message-feed-fade-content)")).toBeLessThan(
			maskImage.indexOf("to right"),
		);
		expect(maskImage.indexOf("to right")).toBeLessThan(
			maskImage.indexOf("var(--message-feed-fade-gutter)"),
		);
		expect(maskImage).toContain("var(--message-feed-scrollbar-gutter)");
	});

	it("keeps the scrollbar gutter to the very bottom edge", () => {
		const body = ruleBody(fadeCss, ".message-feed-fade");
		// 槽位轮廓默认整条可见，且不带底部渐隐——否则滚到底时滑块尾部又被吃掉。
		expect(body).toContain("--message-feed-fade-gutter: linear-gradient(to bottom, black, black);");
	});

	it("holds the scrollbar back from the immersive titlebar", () => {
		// 槽位随顶栏让开 44px，到 80px 才实心；顶栏那一段里滑块不会现身。
		expect(overlayBody).toContain("--message-feed-fade-gutter:");
		expect(overlayBody).toContain("transparent 44px");
		expect(overlayBody).toContain("black 80px");

		const gutter = overlayBody.slice(overlayBody.indexOf("--message-feed-fade-gutter:"));
		expect(gutter).not.toContain("calc(100% - 32px)");
	});

	it("fades the content's top edge only under the immersive header", () => {
		const base = ruleBody(fadeCss, ".message-feed-fade");
		expect(base).toContain("--message-feed-fade-content: linear-gradient(");
		expect(base).not.toContain("transparent 28px");

		expect(overlayBody).toContain("--message-feed-fade-content:");
		expect(overlayBody).toContain("transparent 28px");
		expect(overlayBody).toContain("black 100px");
	});
});
