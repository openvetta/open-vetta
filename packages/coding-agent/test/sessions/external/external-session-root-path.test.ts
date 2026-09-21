import { describe, expect, it } from "vitest";
import type { ExternalSessionFileHost } from "../../../src/public-api/external-sessions.js";
import { isUnderExternalSessionRoot } from "../../../src/sessions/external/root-path.js";

describe("isUnderExternalSessionRoot", () => {
	it("accepts files inside a configured root and rejects a sibling directory", () => {
		const host = createHost(["/tmp/omp/agent/sessions"]);
		expect(isUnderExternalSessionRoot("/tmp/omp/agent/sessions/2026-09-10.jsonl", host)).toBe(true);
		expect(isUnderExternalSessionRoot("/tmp/omp/agent/sessions-extra/2026-09-10.jsonl", host)).toBe(false);
		expect(isUnderExternalSessionRoot("/workspace/project/.vetta/sessions/named.jsonl", host)).toBe(false);
	});

	it("rejects every path when no external import root is enabled", () => {
		const host = createHost([]);
		expect(isUnderExternalSessionRoot("/tmp/omp/agent/sessions/2026-09-10.jsonl", host)).toBe(false);
	});
});

function createHost(roots: readonly string[]): ExternalSessionFileHost {
	return {
		resolveSessionRoots: () => roots.map((path) => ({ tool: "omp", path })),
		join: (...parts) => parts.join("/"),
		basename: (path) => path.split("/").at(-1) ?? path,
		exists: () => true,
		readText: () => "",
		readPrefixLines: () => "",
		readDirectory: async () => [],
		statModifiedAt: async () => 0,
		statFile: async () => ({ mtimeMs: 0, size: 0 }),
		samePath: (left, right) => left === right,
	};
}
