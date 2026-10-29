import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	classifyBump,
	latestReleasedVersion,
	lockfileDesktopVersion,
	nextVersion,
	retarget,
	setLockfileDesktopVersion,
	startNext,
} from "./release-version.mjs";

const LOCK = `{
  "workspaces": {
    "apps/desktop": {
      "name": "@vetta/desktop",
      "version": "VERSION",
      "dependencies": {},
    },
    "apps/other": {
      "name": "@vetta/other",
      "version": "9.9.9",
    },
  },
}
`;

const roots = [];

function repo(version, notes) {
	const root = mkdtempSync(join(tmpdir(), "vetta-release-version-"));
	roots.push(root);
	mkdirSync(join(root, "apps/desktop"), { recursive: true });
	writeFileSync(join(root, "apps/desktop/package.json"), `${JSON.stringify({ name: "@vetta/desktop", version }, null, "\t")}\n`);
	writeFileSync(join(root, "bun.lock"), LOCK.replace("VERSION", version));
	mkdirSync(join(root, ".github/release-notes"), { recursive: true });
	writeFileSync(join(root, ".github/release-notes", `v${version}.md`), notes);
	return root;
}

const read = (root, path) => readFileSync(join(root, path), "utf8");
const released = (v) => `# Vetta ${v}\n<!-- release-status: released 2026-10-29 -->\n\n## 新增\n\n- 旧条目\n`;
const unreleased = (v) => `# Vetta ${v}\n<!-- release-status: unreleased -->\n\n## 新增\n\n- 正在做的\n`;

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("version arithmetic", () => {
	it("bumps each position and resets the lower ones", () => {
		expect(nextVersion("0.5.69")).toBe("0.5.70");
		expect(nextVersion("0.5.69", "minor")).toBe("0.6.0");
		expect(nextVersion("0.5.69", "major")).toBe("1.0.0");
		expect(nextVersion("0.5.99")).toBe("0.5.100");
		expect(nextVersion("0.5.69", "0.6.0")).toBe("0.6.0");
		expect(() => nextVersion("0.5.69", "v0.6")).toThrow(/Invalid desktop version/);
	});

	it("classifies the step from the last release", () => {
		expect(classifyBump("0.5.69", "0.5.70")).toBe("patch");
		expect(classifyBump("0.5.69", "0.6.0")).toBe("minor");
		expect(classifyBump("0.5.69", "1.0.0")).toBe("major");
		// 跳号与没归零多半是打错，要人确认。
		expect(classifyBump("0.5.69", "0.5.72")).toBe("irregular");
		expect(classifyBump("0.5.69", "0.6.1")).toBe("irregular");
		expect(classifyBump("0.5.69", "0.5.69")).toBe("invalid");
		expect(classifyBump("0.5.69", "0.5.9")).toBe("invalid");
	});

	it("finds the newest release tag numerically, ignoring other tags", () => {
		expect(latestReleasedVersion(["v0.5.9", "v0.5.69", "v0.5.100", "vscode-1", "v1.0.0-rc.1"])).toBe("0.5.100");
		expect(latestReleasedVersion([])).toBeNull();
	});

	it("edits only the desktop entry of bun.lock", () => {
		const updated = setLockfileDesktopVersion(LOCK.replace("VERSION", "0.5.69"), "0.6.0");
		expect(lockfileDesktopVersion(updated)).toBe("0.6.0");
		expect(updated).toContain('"version": "9.9.9"');
		expect(() => setLockfileDesktopVersion("{}", "0.6.0")).toThrow(/no apps\/desktop/);
	});
});

describe("start the next version", () => {
	it("bumps package.json and bun.lock and opens an unreleased notes file", () => {
		const root = repo("0.5.69", released("0.5.69"));
		const result = startNext({ root, latestReleased: "0.5.69" });
		expect(result).toMatchObject({ from: "0.5.69", version: "0.5.70", bump: "patch" });
		expect(JSON.parse(read(root, "apps/desktop/package.json")).version).toBe("0.5.70");
		expect(lockfileDesktopVersion(read(root, "bun.lock"))).toBe("0.5.70");
		expect(read(root, ".github/release-notes/v0.5.70.md")).toBe("# Vetta 0.5.70\n<!-- release-status: unreleased -->\n");
		expect(read(root, ".github/release-notes/v0.5.69.md")).toBe(released("0.5.69"));
	});

	it("opens a minor version when asked", () => {
		const root = repo("0.5.69", released("0.5.69"));
		expect(startNext({ root, spec: "minor", latestReleased: "0.5.69" }).version).toBe("0.6.0");
		expect(existsSync(join(root, ".github/release-notes/v0.6.0.md"))).toBe(true);
	});

	// 当前版本还没发就开下一个，会把它整个跳过去。
	it("refuses while the current version is unreleased", () => {
		const root = repo("0.5.70", unreleased("0.5.70"));
		expect(() => startNext({ root, latestReleased: "0.5.69" })).toThrow(/还没发布.*--retarget/);
	});

	it("asks for confirmation before skipping numbers", () => {
		const root = repo("0.5.69", released("0.5.69"));
		expect(() => startNext({ root, spec: "0.5.72", latestReleased: "0.5.69" })).toThrow(/--allow-irregular/);
		expect(startNext({ root, spec: "0.5.72", latestReleased: "0.5.69", allowIrregular: true }).version).toBe("0.5.72");
	});
});

describe("retarget the version in development", () => {
	it("renames the notes, keeps the entries and moves every version field", () => {
		const root = repo("0.5.70", unreleased("0.5.70"));
		const result = retarget({ root, version: "0.6.0", latestReleased: "0.5.69" });
		expect(result).toMatchObject({ from: "0.5.70", version: "0.6.0", bump: "minor" });
		expect(existsSync(join(root, ".github/release-notes/v0.5.70.md"))).toBe(false);
		const notes = read(root, ".github/release-notes/v0.6.0.md");
		expect(notes).toMatch(/^# Vetta 0\.6\.0\n<!-- release-status: unreleased -->/);
		expect(notes).toContain("- 正在做的");
		expect(JSON.parse(read(root, "apps/desktop/package.json")).version).toBe("0.6.0");
		expect(lockfileDesktopVersion(read(root, "bun.lock"))).toBe("0.6.0");
	});

	it("refuses a released version or one not above the last release", () => {
		expect(() => retarget({ root: repo("0.5.69", released("0.5.69")), version: "0.6.0", latestReleased: "0.5.68" })).toThrow(
			/不能再发一次/,
		);
		expect(() => retarget({ root: repo("0.5.70", unreleased("0.5.70")), version: "0.5.69", latestReleased: "0.5.69" })).toThrow(
			/不比最近一个已发布的 v0\.5\.69 大/,
		);
	});
});
