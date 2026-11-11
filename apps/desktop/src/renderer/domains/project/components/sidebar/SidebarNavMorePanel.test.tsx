// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { SidebarNavItem } from "@vetta-org/theme-sdk/sidebar";
import { SidebarNavMorePanel } from "@vetta-org/theme-ui/sidebar/SidebarNavMorePanel";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function item(key: string, label: string, locked = false): SidebarNavItem {
	return { key, label, icon: "icon-[solar--home-linear]", active: false, type: "custom", locked } as unknown as SidebarNavItem;
}

const noop = () => {};
const dragProps = {
	itemProps: () => ({ draggable: true, onDragStart: noop, onDragEnd: noop, onDragOver: noop, onDrop: noop }),
	regionProps: () => ({ onDragOver: noop, onDrop: noop }),
	isDropBefore: () => false,
	isDropAtEnd: () => false,
	draggingKey: null,
};

function renderPanel(pinnedItems: SidebarNavItem[], moreItems: SidebarNavItem[]) {
	return render(
		<SidebarNavMorePanel
			canPinMore
			drag={dragProps as never}
			labels={{ pinnedTitle: "自定义导航", moreTitle: "更多", pin: "置顶", unpin: "取消置顶", pinFull: "已满", reset: "重置" }}
			moreItems={moreItems}
			onItemClick={vi.fn()}
			onPin={vi.fn()}
			onReset={vi.fn()}
			onUnpin={vi.fn()}
			pinnedItems={pinnedItems}
		/>,
	);
}

describe("SidebarNavMorePanel", () => {
	it("does not list locked pinned entries such as 新会话, which are fixed at the top anyway", () => {
		renderPanel([item("new", "新会话", true), item("abilities", "能力")], [item("auto", "自动化")]);

		expect(screen.queryByText("新会话")).toBeNull();
		expect(screen.getByText("能力")).toBeTruthy();
		expect(screen.getByText("自动化")).toBeTruthy();
	});

	it("keeps the locked tail entry of the more region", () => {
		renderPanel([item("abilities", "能力")], [item("auto", "自动化"), item("more-options", "更多选项", true)]);

		expect(screen.getByText("更多选项")).toBeTruthy();
	});
});
