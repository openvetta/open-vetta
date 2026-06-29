import { describe, expect, it } from "vitest";
import type { RawsDiff } from "../src/core/knowledge/differ.js";
import {
	applyQuarantine,
	attemptedFiles,
	clearFailures,
	EMPTY_FAILURES,
	type FailuresRecord,
	KB_MAX_PROCESSING_ATTEMPTS,
	quarantinedHashes,
	reconcileFailures,
} from "../src/core/knowledge/failures.js";

const emptyDiff = (): RawsDiff => ({ added: [], moved: [], changed: [], deleted: [] });

const NOW = "2026-06-22T00:00:00.000Z";

describe("knowledge failures（失败计数 + 隔离）", () => {
	it("attemptedFiles：从 added/changed 抽出尝试加工的文件（added 用 raw.hash，changed 用 newHash）", () => {
		const diff: RawsDiff = {
			...emptyDiff(),
			added: [{ type: "added", raw: { source: "g", source_path: "g/a.md", source_hash: "ha", size: 1 } }],
			changed: [{ type: "changed", id: "id1", source_path: "g/b.md", oldHash: "old", newHash: "hb", source: "g" }],
		};
		expect(attemptedFiles(diff)).toEqual([
			{ source_hash: "ha", source_path: "g/a.md" },
			{ source_hash: "hb", source_path: "g/b.md" },
		]);
	});

	it("失败累计到阈值才隔离；未达阈值不隔离", () => {
		const attempted = [{ source_hash: "h", source_path: "g/x.pdf" }];
		const presentHashes = new Set<string>(); // wiki 始终没出现该 hash → 一直失败
		const rawHashes = new Set(["h"]);

		let rec: FailuresRecord = EMPTY_FAILURES;
		for (let i = 1; i < KB_MAX_PROCESSING_ATTEMPTS; i++) {
			rec = reconcileFailures({ failures: rec, attempted, presentHashes, rawHashes, now: NOW });
			expect(rec.entries.h.attempts).toBe(i);
			expect(rec.entries.h.quarantined).toBe(false);
			expect(quarantinedHashes(rec).has("h")).toBe(false);
		}
		// 第 KB_MAX_PROCESSING_ATTEMPTS 次 → 隔离
		rec = reconcileFailures({ failures: rec, attempted, presentHashes, rawHashes, now: NOW });
		expect(rec.entries.h.attempts).toBe(KB_MAX_PROCESSING_ATTEMPTS);
		expect(rec.entries.h.quarantined).toBe(true);
		expect(quarantinedHashes(rec).has("h")).toBe(true);
	});

	it("成功（wiki 出现该 hash）→ 清除失败记录", () => {
		const attempted = [{ source_hash: "h", source_path: "g/x.pdf" }];
		const rawHashes = new Set(["h"]);
		let rec = reconcileFailures({
			failures: EMPTY_FAILURES,
			attempted,
			presentHashes: new Set(),
			rawHashes,
			now: NOW,
		});
		expect(rec.entries.h).toBeDefined();
		// 下一轮成功
		rec = reconcileFailures({ failures: rec, attempted, presentHashes: new Set(["h"]), rawHashes, now: NOW });
		expect(rec.entries.h).toBeUndefined();
	});

	it("剪枝：记录里的 hash 已不在当前 raws（内容改了/删了）→ 丢弃", () => {
		const stale: FailuresRecord = {
			version: 1,
			entries: {
				oldhash: {
					source_path: "g/x.pdf",
					attempts: 5,
					first_failed_at: NOW,
					last_failed_at: NOW,
					quarantined: true,
				},
			},
		};
		const rec = reconcileFailures({
			failures: stale,
			attempted: [],
			presentHashes: new Set(),
			rawHashes: new Set(["newhash"]), // 旧 hash 已不在
			now: NOW,
		});
		expect(rec.entries.oldhash).toBeUndefined();
	});

	it("applyQuarantine：剔除隔离的 added/changed，moved/deleted 不动", () => {
		const diff: RawsDiff = {
			added: [
				{ type: "added", raw: { source: "g", source_path: "g/a.md", source_hash: "qa", size: 1 } },
				{ type: "added", raw: { source: "g", source_path: "g/b.md", source_hash: "ok", size: 1 } },
			],
			changed: [{ type: "changed", id: "i", source_path: "g/c.md", oldHash: "o", newHash: "qc", source: "g" }],
			moved: [{ type: "moved", id: "m", from: "x", to: "y", source: "g", source_hash: "mh" }],
			deleted: [{ type: "deleted", id: "d", source_path: "g/d.md", source_hash: "dh" }],
		};
		const out = applyQuarantine(diff, new Set(["qa", "qc"]));
		expect(out.added.map((a) => a.raw.source_hash)).toEqual(["ok"]);
		expect(out.changed).toHaveLength(0);
		expect(out.moved).toHaveLength(1);
		expect(out.deleted).toHaveLength(1);
	});

	it("clearFailures：指定 hash 清除；不传则清空全部", () => {
		const rec: FailuresRecord = {
			version: 1,
			entries: {
				h1: { source_path: "a", attempts: 3, first_failed_at: NOW, last_failed_at: NOW, quarantined: true },
				h2: { source_path: "b", attempts: 3, first_failed_at: NOW, last_failed_at: NOW, quarantined: true },
			},
		};
		expect(clearFailures(rec, new Set(["h1"])).entries).toEqual({ h2: rec.entries.h2 });
		expect(clearFailures(rec).entries).toEqual({});
	});
});
