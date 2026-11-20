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
	 * mask 会在绘制阶段连滚动条一起淡出，滚动条无法用 z-index 抬上来。
	 * 唯一的解法是把滚动条槽位从渐隐里排除：第二层 mask 在右缘恒为不透明，
	 * 与纵向渐隐相加后槽位保持 1。少了这一层或改成 subtract，滑块首尾又会被吃掉。
	 */
	it("keeps the scrollbar gutter out of the fade with an additive mask layer", () => {
		const body = ruleBody(fadeCss, ".message-feed-fade");
		expect(body).toContain("mask-composite: add;");
		expect(body).toContain("--message-feed-scrollbar-gutter: 8px;");
		// 两层 mask：先右缘槽位，再纵向渐隐。
		const maskImage = body.slice(body.indexOf("mask-image:"), body.indexOf("mask-composite"));
		expect(maskImage).toContain("to right");
		expect(maskImage).toContain("var(--message-feed-scrollbar-gutter)");
		expect(maskImage).toContain("var(--message-feed-fade-content)");
	});

	it("fades the top edge only under the immersive header", () => {
		const base = ruleBody(fadeCss, ".message-feed-fade");
		expect(base).toContain("--message-feed-fade-content: linear-gradient(");
		expect(base).not.toContain("transparent 28px");

		const overlay = ruleBody(fadeCss, '[data-header-overlay="true"] .message-feed-fade');
		expect(overlay).toContain("--message-feed-fade-content:");
		expect(overlay).toContain("transparent 28px");
		expect(overlay).toContain("black 100px");
	});
});
