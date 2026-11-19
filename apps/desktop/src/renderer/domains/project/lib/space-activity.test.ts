import { MAIN_SPACE } from "@shared/store/spaces";
import { describe, expect, it } from "vitest";
import { type SpaceActivityEntry, summarizeSpaceActivity } from "./space-activity";

const DEFAULT_CWD = "/home/me/vetta/conversation";
const spaces = {
	projects: { "/work/api": "work", "/work/web": "work", "/life/blog": "life" },
	conversations: { "/home/me/vetta/conversation/moved.jsonl": "life" },
};
const projectCwds = ["/work/api", "/work/web", "/life/blog"];

function summarize(
	activity: readonly SpaceActivityEntry[],
	overrides: Partial<Parameters<typeof summarizeSpaceActivity>[0]> = {},
) {
	return Object.fromEntries(
		summarizeSpaceActivity({
			activity,
			spaces,
			projectCwds,
			defaultCwd: DEFAULT_CWD,
			...overrides,
		}),
	);
}

describe("summarizeSpaceActivity", () => {
	it("运行与等待分开计数，同一会话两者都算", () => {
		const summary = summarize([
			{ sessionPath: "/work/api/.vetta/sessions/a.jsonl", running: true, waiting: true },
			{ sessionPath: "/work/api/.vetta/sessions/b.jsonl", running: true, waiting: false },
		]);
		expect(summary).toEqual({ work: { running: 2, waiting: 1 } });
	});

	it("显式的独立会话归属优先于 cwd 推断", () => {
		// 这条会话躺在默认对话目录里，但被移进了「生活」空间。
		const summary = summarize([
			{ sessionPath: "/home/me/vetta/conversation/moved.jsonl", running: true, waiting: false },
		]);
		expect(summary).toEqual({ life: { running: 1, waiting: 0 } });
	});

	it("没给 cwd 时按会话路径反推项目，未登记的项目回落主工作空间", () => {
		const summary = summarize([
			{ sessionPath: "/work/web/.vetta/sessions/w.jsonl", running: true, waiting: false },
			{ sessionPath: "/tmp/scratch/.vetta/sessions/s.jsonl", running: true, waiting: false },
			{ sessionPath: "/home/me/vetta/conversation/c.jsonl", running: true, waiting: false },
		]);
		expect(summary).toEqual({
			work: { running: 1, waiting: 0 },
			[MAIN_SPACE]: { running: 2, waiting: 0 },
		});
	});

	it("团队会话按调用方解析好的归属归集", () => {
		const spaceByPath = new Map([["/work/api/.vetta/team/lead.jsonl", "work"]]);
		const summary = summarize([{ sessionPath: "/work/api/.vetta/team/lead.jsonl", running: true, waiting: true }], {
			spaceByPath,
		});
		expect(summary).toEqual({ work: { running: 1, waiting: 1 } });
	});

	it("最长路径优先：子目录里的项目不会被父目录抢走", () => {
		const summary = summarize(
			[{ sessionPath: "/work/api/sub/.vetta/sessions/x.jsonl", running: true, waiting: false }],
			{
				projectCwds: ["/work", "/work/api"],
				spaces: { projects: { "/work": "work", "/work/api": "api" }, conversations: {} },
			},
		);
		expect(summary).toEqual({ api: { running: 1, waiting: 0 } });
	});

	it("既不在跑也不在等的会话不参与汇总", () => {
		expect(summarize([{ sessionPath: "/work/api/.vetta/sessions/a.jsonl", running: false, waiting: false }])).toEqual(
			{},
		);
	});
});
