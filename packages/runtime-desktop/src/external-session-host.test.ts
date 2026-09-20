import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDesktopExternalSessionHost } from "./external-session-host.js";

const temporaryRoots = new Set<string>();

afterEach(() => {
	for (const root of temporaryRoots) rmSync(root, { force: true, recursive: true });
	temporaryRoots.clear();
});

describe("Desktop external session host", () => {
	it("readPrefixLines returns only the requested lines of a longer file", () => {
		const root = mkdtempSync(join(tmpdir(), "vetta-prefix-lines-"));
		temporaryRoots.add(root);
		const path = join(root, "session.jsonl");
		writeFileSync(path, `one\ntwo\nthree\n${"x".repeat(256 * 1024)}\n`);
		const host = createDesktopExternalSessionHost({});
		expect(host.readPrefixLines(path, 2)).toBe("one\ntwo");
	});
});
