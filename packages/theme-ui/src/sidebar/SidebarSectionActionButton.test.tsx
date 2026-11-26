// @vitest-environment jsdom

import { act, createRef, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarSectionActionButton } from "./SidebarSectionActionButton";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
	for (const { root, container } of mounted.splice(0)) {
		act(() => root.unmount());
		container.remove();
	}
});

function mount(element: JSX.Element): HTMLButtonElement {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push({ root, container });
	act(() => root.render(element));
	return container.querySelector("button") as HTMLButtonElement;
}

describe("SidebarSectionActionButton", () => {
	it("is a named, non-submitting button that forwards its ref and host attributes", () => {
		const ref = createRef<HTMLButtonElement>();
		const button = mount(
			<SidebarSectionActionButton
				ref={ref}
				aria-haspopup="menu"
				className="shrink-0"
				iconClassName="icon-[solar--menu-dots-bold]"
				label="View options"
			/>,
		);

		expect(ref.current).toBe(button);
		expect(button.type).toBe("button");
		expect(button.getAttribute("aria-label")).toBe("View options");
		expect(button.getAttribute("aria-haspopup")).toBe("menu");
		expect(button.classList.contains("shrink-0")).toBe(true);
	});

	it("exposes the open state to assistive technology only when it triggers a menu", () => {
		const menuTrigger = (expanded: boolean) =>
			mount(
				<SidebarSectionActionButton
					aria-haspopup="menu"
					expanded={expanded}
					iconClassName="icon-[solar--menu-dots-bold]"
					label="View options"
				/>,
			);
		expect(menuTrigger(false).getAttribute("aria-expanded")).toBe("false");
		expect(menuTrigger(true).getAttribute("aria-expanded")).toBe("true");
		expect(
			mount(<SidebarSectionActionButton expanded iconClassName="icon-[solar--add-linear]" label="Add" />).hasAttribute(
				"aria-expanded",
			),
		).toBe(false);
	});

	it("stays hidden until its row is hovered or it takes keyboard focus, unless it is always shown", () => {
		const hover = mount(<SidebarSectionActionButton iconClassName="icon-[solar--add-linear]" label="Add" />);
		expect(hover.dataset.reveal).toBe("hover");
		expect(hover.classList).toContain("opacity-0");
		expect(hover.classList).toContain("group-hover:opacity-60");
		expect(hover.classList).toContain("focus-visible:opacity-100");

		const always = mount(<SidebarSectionActionButton iconClassName="icon-[solar--add-linear]" label="Add" reveal="always" />);
		expect(always.dataset.reveal).toBe("always");
		expect(always.classList).not.toContain("opacity-0");

		const open = mount(<SidebarSectionActionButton expanded iconClassName="icon-[solar--add-linear]" label="Add" />);
		expect(open.classList).toContain("opacity-100");
		expect(open.classList).not.toContain("opacity-0");
	});

	it("reports whether its menu is open", () => {
		expect(
			mount(<SidebarSectionActionButton iconClassName="icon-[solar--add-linear]" label="Add" />).dataset.state,
		).toBe("closed");
		expect(
			mount(<SidebarSectionActionButton expanded iconClassName="icon-[solar--add-linear]" label="Add" />).dataset.state,
		).toBe("open");
	});
});
