import { describe, expect, it } from "vitest";
import { PendingInteractions } from "./pending-interactions";

describe("PendingInteractions", () => {
	it("同一会话的多个请求各自记账，逐个答复只清掉自己那一个", () => {
		const pending = new PendingInteractions();
		expect(pending.begin("/p/.vetta/sessions/a.jsonl", "question:1")).toBe(true);
		expect(pending.begin("/p/.vetta/sessions/a.jsonl", "sandbox:2")).toBe(false);
		expect(pending.countOf("/p/.vetta/sessions/a.jsonl")).toBe(2);

		expect(pending.end("/p/.vetta/sessions/a.jsonl", "question:1")).toBe(false);
		expect(pending.countOf("/p/.vetta/sessions/a.jsonl")).toBe(1);
		expect(pending.list()).toEqual([{ sessionPath: "/p/.vetta/sessions/a.jsonl", count: 1 }]);

		expect(pending.end("/p/.vetta/sessions/a.jsonl", "sandbox:2")).toBe(true);
		expect(pending.list()).toEqual([]);
	});

	it("重复开始 / 重复结束 / 结束未登记的请求都不改变状态", () => {
		const pending = new PendingInteractions();
		pending.begin("/p/a.jsonl", "question:1");
		expect(pending.begin("/p/a.jsonl", "question:1")).toBe(false);
		expect(pending.countOf("/p/a.jsonl")).toBe(1);

		expect(pending.end("/p/a.jsonl", "question:1")).toBe(true);
		expect(pending.end("/p/a.jsonl", "question:1")).toBe(false);
		expect(pending.end("/p/missing.jsonl", "question:9")).toBe(false);
		expect(pending.list()).toEqual([]);
	});

	it("按会话分开统计", () => {
		const pending = new PendingInteractions();
		pending.begin("/p/a.jsonl", "plan-review:1");
		pending.begin("/p/b.jsonl", "question:2");
		expect(pending.list()).toEqual([
			{ sessionPath: "/p/a.jsonl", count: 1 },
			{ sessionPath: "/p/b.jsonl", count: 1 },
		]);
		expect(pending.countOf("/p/c.jsonl")).toBe(0);
	});
});
