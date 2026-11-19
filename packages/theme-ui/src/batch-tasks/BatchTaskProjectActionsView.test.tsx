import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BatchTaskProjectActionsView } from "./BatchTaskProjectActionsView";
import type { BatchProjectCountsView, BatchTaskProjectActionsLabels } from "./types";

const labels: BatchTaskProjectActionsLabels = {
	stop: "停止",
	start: "开始",
	allDone: "已全部完成",
	allDoneOrFailed: (n) => `已完成，${n} 个失败`,
	reset: "重置",
	editProject: "编辑",
	deleteProject: "删除",
};

function counts(overrides: Partial<BatchProjectCountsView> = {}): BatchProjectCountsView {
	return {
		failed: 0,
		running: 0,
		completed: 0,
		paused: 0,
		neverExecuted: 2,
		total: 2,
		...overrides,
	};
}

function markup(overrides: Partial<BatchProjectCountsView> = {}, hasQueued = false): string {
	return renderToStaticMarkup(
		<BatchTaskProjectActionsView
			counts={counts(overrides)}
			hasQueued={hasQueued}
			labels={labels}
			onBatchReset={vi.fn()}
			onBatchStart={vi.fn()}
			onBatchStop={vi.fn()}
			onDeleteProject={vi.fn()}
			onEditProject={vi.fn()}
		/>,
	);
}

function button(html: string, label: string): string {
	const match = html.match(new RegExp(`<button\\b[^>]*aria-label="${label}"[^>]*>`));
	expect(match, label).not.toBeNull();
	return match?.[0] ?? "";
}

function isDisabled(tag: string): boolean {
	return tag.includes('disabled=""');
}


describe("批量任务项目操作", () => {
	it("空闲项目把开始和重置、编辑和删除分成两组按钮组", () => {
		const html = markup();

		expect(html.match(/data-slot="button-group"/g)).toHaveLength(2);
		expect(isDisabled(button(html, "开始"))).toBe(false);
		expect(button(html, "开始")).toContain('title="开始"');
		expect(isDisabled(button(html, "重置"))).toBe(false);
		expect(isDisabled(button(html, "编辑"))).toBe(false);
		expect(isDisabled(button(html, "删除"))).toBe(false);
		expect(html).not.toContain('aria-label="停止"');
		expect(html.indexOf('aria-label="重置"')).toBeLessThan(html.indexOf('aria-label="编辑"'));
	});

	it("有任务在跑或排队时第一组换成停止，跑着时禁用删除", () => {
		const running = markup({ running: 1, neverExecuted: 1 });
		const queued = markup({}, true);

		for (const html of [running, queued]) {
			expect(html).toContain('aria-label="停止"');
			expect(html).not.toContain('aria-label="开始"');
			expect(isDisabled(button(html, "编辑"))).toBe(false);
		}
		expect(isDisabled(button(running, "删除"))).toBe(true);
		expect(isDisabled(button(queued, "删除"))).toBe(false);
	});


	it("没有可开始的任务时禁用开始，并说明原因", () => {
		const done = markup({ neverExecuted: 0, paused: 0, completed: 2 });
		const failed = markup({ neverExecuted: 0, paused: 0, failed: 1, completed: 1 });

		expect(button(done, "开始")).toContain('title="已全部完成"');
		expect(isDisabled(button(done, "开始"))).toBe(true);
		expect(button(failed, "开始")).toContain('title="已完成，1 个失败"');
		expect(isDisabled(button(failed, "开始"))).toBe(true);
	});

	it("没有任务时禁用重置", () => {
		const html = markup({ neverExecuted: 0, total: 0 });
		expect(isDisabled(button(html, "重置"))).toBe(true);
		expect(isDisabled(button(html, "开始"))).toBe(true);
	});
});
