// @vitest-environment jsdom

import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AtPanelView, type AtPanelEntryModel, type AtPanelViewProps } from "./AtPanelView";

const labels: AtPanelViewProps["labels"] = {
	header: "Reference",
	headingMeta: "/",
	loading: "Loading",
	noResults: "None",
	emptyDirectory: "Empty",
	goUp: "..",
	enterDirectory: "Tab to enter",
	citeDirectory: "Attach folder",
	citeDirectoryHint: "Attach this folder (⌘↩)",
};

function entry(overrides: Partial<AtPanelEntryModel> = {}): AtPanelEntryModel {
	return {
		path: "/workspace/src",
		name: "src",
		isDirectory: true,
		index: 0,
		active: false,
		icon: "icon-folder",
		...overrides,
	};
}

function markup(entries: AtPanelEntryModel[]): string {
	return renderToStaticMarkup(
		<AtPanelView
			open
			loading={false}
			normalizedFilter=""
			canGoUp={false}
			goUpActive={false}
			entries={entries}
			labels={labels}
			panelRef={createRef()}
			onGoUp={() => undefined}
			onHoverIndex={() => undefined}
			onEntryClick={() => undefined}
			onCiteDirectory={() => undefined}
		/>,
	);
}

describe("AtPanelView directory citation", () => {
	it("浏览目录时给出单独的引用按钮，搜索结果里的目录没有", () => {
		const browsing = markup([entry()]);
		expect(browsing).toContain("Attach folder");
		expect(browsing).toContain("Tab to enter");

		const searching = markup([entry({ relPath: "src" })]);
		expect(searching).not.toContain("Attach folder");
		expect(searching).not.toContain("Tab to enter");
	});
});
