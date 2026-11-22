import { describe, expect, it } from "vitest";
import type { DesktopSessionSearchResult } from "../../shared/session-search.js";
import { createSessionSearchResultBatcher } from "./session-search-result-batcher.js";

function result(path: string): DesktopSessionSearchResult {
	return {
		session: {
			id: path,
			path,
			cwd: "C:/w",
			firstMessage: "",
			modifiedAt: 1,
			access: { readHistory: true, resume: true, rename: true, delete: true },
		},
		sourceCwd: "C:/w",
		sourceKind: "project",
		match: { field: "title", snippet: path },
	};
}

describe("createSessionSearchResultBatcher", () => {
	it("sends results produced in the same turn as one batch on the next turn", () => {
		const sent: string[][] = [];
		const queue: (() => void)[] = [];
		const batcher = createSessionSearchResultBatcher(
			(batch) => sent.push(batch.map((item) => item.session.path)),
			(callback) => queue.push(callback),
		);

		batcher.push(result("a"));
		batcher.push(result("b"));
		expect(sent).toEqual([]);
		for (const run of queue.splice(0)) run();
		batcher.push(result("c"));
		for (const run of queue.splice(0)) run();

		expect(sent).toEqual([["a", "b"], ["c"]]);
	});

	it("flushes pending results immediately so they arrive before the done event", () => {
		const sent: string[][] = [];
		const batcher = createSessionSearchResultBatcher(
			(batch) => sent.push(batch.map((item) => item.session.path)),
			() => {},
		);
		batcher.push(result("a"));
		batcher.flush();
		batcher.flush();
		expect(sent).toEqual([["a"]]);
	});
});
