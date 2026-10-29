import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
	desktopVersion,
	markReleased,
	parseReleaseStatus,
	releaseNotesPath,
	requireReleaseNotes,
	requireUnreleasedNotes,
} from "./release-notes.mjs";

const roots = [];

function fixtureRoot(version, notesVersions = [], body = (v) => `# Vetta ${v}\n`) {
	const root = mkdtempSync(join(tmpdir(), "vetta-release-notes-"));
	roots.push(root);
	mkdirSync(join(root, "apps/desktop"), { recursive: true });
	writeFileSync(join(root, "apps/desktop/package.json"), JSON.stringify({ version }));
	mkdirSync(join(root, ".github/release-notes"), { recursive: true });
	for (const notesVersion of notesVersions) {
		writeFileSync(join(root, ".github/release-notes", `v${notesVersion}.md`), body(notesVersion));
	}
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("release notes addressing", () => {
	it("maps a version to its release notes file", () => {
		expect(releaseNotesPath("0.5.58")).toBe(".github/release-notes/v0.5.58.md");
	});

	it("rejects a version that is not semver", () => {
		expect(() => releaseNotesPath("0.5")).toThrow(/Invalid release version/);
		expect(() => releaseNotesPath("v0.5.58")).toThrow(/Invalid release version/);
	});

	it("resolves the desktop version from the package manifest", () => {
		expect(desktopVersion(fixtureRoot("0.5.58"))).toBe("0.5.58");
	});

	it("returns the path when the notes exist", () => {
		const root = fixtureRoot("0.5.58", ["0.5.58"]);
		expect(requireReleaseNotes("0.5.58", root)).toBe(".github/release-notes/v0.5.58.md");
	});

	// 缺发布说明必须拦住发版：它就是 Release 的正文，补不上就没有正文可发。
	it("explains how to fix a missing release note", () => {
		const root = fixtureRoot("0.5.59", ["0.5.58"]);
		expect(() => requireReleaseNotes("0.5.59", root)).toThrow(/Missing release notes for v0\.5\.59/);
		expect(() => requireReleaseNotes("0.5.59", root)).toThrow(/release-notes\/README\.md/);
	});

	it("ships release notes for the version this repository is about to release", () => {
		expect(requireReleaseNotes(desktopVersion())).toMatch(/^\.github\/release-notes\/v\d+\.\d+\.\d+\.md$/);
	});
});

describe("release status marker", () => {
	const unreleased = (v) => `# Vetta ${v}\n<!-- release-status: unreleased -->\n\n## 新增\n\n- 一条\n`;

	it("reads the three states", () => {
		expect(parseReleaseStatus("# Vetta 0.5.70\n<!-- release-status: unreleased -->\n")).toEqual({ state: "unreleased", date: null });
		expect(parseReleaseStatus("# Vetta 0.5.69\n<!-- release-status: released 2026-10-29 -->\n")).toEqual({
			state: "released",
			date: "2026-10-29",
		});
		expect(parseReleaseStatus("# Vetta 0.5.60\n")).toEqual({ state: "unmarked", date: null });
	});

	// 旧文件没有标记：当作已发布，宁可拦住发版，也不让人往已发布的说明里续写。
	it("refuses to release a version that is released or unmarked", () => {
		const unmarked = fixtureRoot("0.5.60", ["0.5.60"]);
		expect(() => requireUnreleasedNotes("0.5.60", unmarked)).toThrow(/没有 release-status 标记/);
		const released = fixtureRoot("0.5.69", ["0.5.69"], (v) => `# Vetta ${v}\n<!-- release-status: released 2026-10-29 -->\n`);
		expect(() => requireUnreleasedNotes("0.5.69", released)).toThrow(/已于 2026-10-29 发布/);
	});

	it("marks an unreleased version as released, once", () => {
		const root = fixtureRoot("0.5.70", ["0.5.70"], unreleased);
		markReleased("0.5.70", "2026-11-02", root);
		const text = readFileSync(join(root, ".github/release-notes/v0.5.70.md"), "utf8");
		expect(text).toContain("<!-- release-status: released 2026-11-02 -->");
		expect(text).toContain("- 一条");
		expect(() => markReleased("0.5.70", "2026-11-03", root)).toThrow(/已于 2026-11-02 发布/);
		expect(() => markReleased("0.5.70", "11/03", root)).toThrow(/Invalid release date/);
	});
});

