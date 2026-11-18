// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ProjectSessionsView } from "@vetta-org/theme-ui/project";
import { describe, expect, it } from "vitest";

const SESSIONS = [{ key: "s1" }, { key: "s2" }];

function renderView(expanded: boolean, loading = false) {
	return (
		<ProjectSessionsView
			empty={<div>empty</div>}
			expanded={expanded}
			hasMore={false}
			loading={loading}
			labels={{ collapse: "收起", expand: "展开" }}
			onToggleShowAll={() => {}}
			scrollParent={null}
			sessions={SESSIONS}
			showAll={false}
			renderSession={(session) => (
				<button key={session.key} type="button">
					会话 {session.key}
				</button>
			)}
		/>
	);
}

describe("ProjectSessionsView 展开/折叠", () => {
	it("首次展开直接提交列表布局，折叠立即卸载，再次展开恢复会话", () => {
		const { container, rerender } = render(renderView(false));
		expect(screen.queryByText("会话 s1")).toBeNull();

		rerender(renderView(true, true));
		expect(container.firstElementChild?.hasAttribute("hidden")).toBe(true);
		expect(container.firstElementChild?.childElementCount).toBe(0);

		rerender(renderView(true));
		expect(screen.getByRole("button", { name: "会话 s1" })).toBeDefined();
		expect(container.firstElementChild?.className).not.toContain("grid-template-rows");
		expect(container.firstElementChild?.firstElementChild?.className).toContain("motion-reduce:animate-none");

		rerender(renderView(false));
		expect(screen.queryByText("会话 s1")).toBeNull();

		rerender(renderView(true));
		expect(screen.getByRole("button", { name: "会话 s2" })).toBeDefined();
	});
});
