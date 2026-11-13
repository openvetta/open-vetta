import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActivityPanel } from "./ActivityPanel";
import { ActivityPanelFrame } from "./ActivityPanelFrame";

describe("ActivityPanelFrame", () => {
	it("keeps only the top-left corner and the left and top edges", () => {
		const markup = renderToStaticMarkup(
			<ActivityPanelFrame>
				<span>内容</span>
			</ActivityPanelFrame>,
		);
		expect(markup).toContain("rounded-tl-xl");
		expect(markup).toContain("border-l border-t border-border");
		expect(markup).not.toContain("rounded-tr-");
		expect(markup).not.toContain("rounded-bl-");
		expect(markup).not.toContain("rounded-br-");
		expect(markup).not.toContain("border-r");
		expect(markup).not.toContain("border-b ");
	});
});

describe("ActivityPanel header", () => {
	it("leaves room between the tab row and the window header buttons", () => {
		const markup = renderToStaticMarkup(
			<ActivityPanel.Root isOpen width={360} minWidth={200} maxWidth={800} onOpenChange={() => undefined}>
				<ActivityPanel.Header>标签</ActivityPanel.Header>
			</ActivityPanel.Root>,
		);
		expect(markup).toContain("pt-3");
	});
});
