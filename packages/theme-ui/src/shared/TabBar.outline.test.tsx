// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "./TabBar";

describe("TabBar active outline", () => {
	let root: Root;
	let host: HTMLDivElement;

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(96);
		vi.stubGlobal(
			"ResizeObserver",
			class {
				observe(): void {}
				disconnect(): void {}
				unobserve(): void {}
			},
		);
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
	});

	afterEach(() => {
		act(() => root.unmount());
		host.remove();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function renderBar(suppressLayoutAnimation: boolean): void {
		const view: ReactNode = (
			<TabBar
				items={[{ key: "files", label: "文件" }]}
				onChange={() => undefined}
				suppressLayoutAnimation={suppressLayoutAnimation}
				value="files"
			/>
		);
		act(() => {
			root.render(view);
		});
	}

	it("keeps the three-sided outline after resizing stops changing the tab width", () => {
		renderBar(false);
		expect(host.querySelector("[data-connected-tab-outline]")).not.toBeNull();

		renderBar(true);
		expect(host.querySelector("[data-connected-tab-outline]")).not.toBeNull();

		renderBar(false);
		expect(host.querySelector("[data-connected-tab-outline]")).not.toBeNull();
	});
});
