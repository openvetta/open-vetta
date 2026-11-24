// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SegmentedControl } from "./SegmentedControl";

type Scope = "all" | "mine" | "empty";

describe("SegmentedControl", () => {
	let root: Root;
	let host: HTMLDivElement;

	function renderControl(value: Scope, onChange: (next: Scope) => void): HTMLElement {
		const items = [
			{ key: "all" as Scope, label: "All", count: 12 },
			{ key: "mine" as Scope, label: "Mine" },
			// 0 不该显示：计数为 0 的标签栏和没有计数长得一样，免得读成一枚空徽标。
			{ key: "empty" as Scope, label: "Empty", count: 0 },
		];
		act(() => root.render(<SegmentedControl items={items} value={value} onChange={onChange} />));
		return host;
	}

	beforeEach(() => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		host = document.createElement("div");
		document.body.append(host);
		root = createRoot(host);
	});

	afterEach(() => {
		act(() => root.unmount());
		host.remove();
	});

	it("renders a per-item count as muted trailing text and skips zero", () => {
		const container = renderControl("all", () => {});

		const allTab = container.querySelector("button") as HTMLElement;
		expect(allTab.textContent).toBe("All12");
		// 计数是中性量，不能借用未读徽标的告警配色。
		const count = allTab.querySelector("span > span") as HTMLElement;
		expect(count.textContent).toBe("12");
		expect(count.className).toContain("text-muted-foreground");

		const buttons = container.querySelectorAll("button");
		expect(buttons[1]?.textContent).toBe("Mine");
		expect(buttons[2]?.textContent).toBe("Empty");
	});

	it("reports the clicked key and highlights the current one", () => {
		const picks: Scope[] = [];
		const container = renderControl("all", (next) => picks.push(next));
		const buttons = container.querySelectorAll("button");

		expect(buttons[0]?.className).toContain("text-foreground");
		expect(buttons[1]?.className).toContain("text-muted-foreground");

		act(() => (buttons[1] as HTMLButtonElement).click());
		expect(picks).toEqual(["mine"]);

		renderControl("mine", () => {});
		const afterSwitch = container.querySelectorAll("button");
		expect(afterSwitch[1]?.className).toContain("text-foreground");
		expect(afterSwitch[0]?.className).toContain("text-muted-foreground");
	});
});
