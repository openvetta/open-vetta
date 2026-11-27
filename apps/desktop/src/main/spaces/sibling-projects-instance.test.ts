import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSpaceSiblingMirror, saveSpaceSiblingMirror } from "./sibling-projects-instance.js";

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), "vetta-space-mirror-"));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("space sibling mirror file", () => {
	const mirror = {
		spaces: [{ id: "product", siblingProjects: true }],
		projects: { "/work/a": "product" },
		conversations: {},
	};

	it("round-trips through a versioned envelope", async () => {
		const path = join(dir, "mirror.json");
		await saveSpaceSiblingMirror(mirror, path);
		expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ schemaVersion: 1, mirror });
		expect(await loadSpaceSiblingMirror(path)).toEqual(mirror);
	});

	it("treats a missing file as no mirror", async () => {
		expect(await loadSpaceSiblingMirror(join(dir, "missing.json"))).toBeUndefined();
	});

	it("ignores files from an unknown schema version", async () => {
		const path = join(dir, "future.json");
		await writeFile(path, JSON.stringify({ schemaVersion: 2, mirror }), "utf8");
		expect(await loadSpaceSiblingMirror(path)).toBeUndefined();
	});

	it("rejects corrupt files so the caller can log and fall back", async () => {
		const path = join(dir, "corrupt.json");
		await writeFile(path, "{not json", "utf8");
		await expect(loadSpaceSiblingMirror(path)).rejects.toThrow();
	});
});
