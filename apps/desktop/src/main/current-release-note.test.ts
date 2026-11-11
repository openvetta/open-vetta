import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCurrentReleaseNote, stripReleaseNoteHeader } from "./current-release-note";

const SAMPLE = "# Vetta 1.2.3\n<!-- release-status: unreleased -->\n\n## 新增\n\n- 新功能 A\n";

describe("stripReleaseNoteHeader", () => {
	it("去掉标题与发布状态标记，只留正文", () => {
		expect(stripReleaseNoteHeader(SAMPLE)).toBe("## 新增\n\n- 新功能 A");
	});

	it("兼容 CRLF，且不误删正文里的二级标题", () => {
		expect(stripReleaseNoteHeader(SAMPLE.replace(/\n/g, "\r\n"))).toBe("## 新增\n\n- 新功能 A");
	});

	it("只有标题时返回空串", () => {
		expect(stripReleaseNoteHeader("# Vetta 1.2.3\n<!-- release-status: unreleased -->\n")).toBe("");
	});
});

describe("readCurrentReleaseNote", () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	function makeRoot(): string {
		const dir = mkdtempSync(join(tmpdir(), "release-note-"));
		dirs.push(dir);
		return dir;
	}

	it("打包后读 Resources/release-notes/v<版本>.md", () => {
		const resources = makeRoot();
		mkdirSync(join(resources, "release-notes"));
		writeFileSync(join(resources, "release-notes", "v1.2.3.md"), SAMPLE);
		expect(
			readCurrentReleaseNote({ version: "1.2.3", isPackaged: true, resourcesPath: resources, cwd: "/nope" }),
		).toBe("## 新增\n\n- 新功能 A");
	});

	it("开发态读仓库 .github/release-notes（cwd 为 apps/desktop）", () => {
		const repo = makeRoot();
		mkdirSync(join(repo, ".github", "release-notes"), { recursive: true });
		mkdirSync(join(repo, "apps", "desktop"), { recursive: true });
		writeFileSync(join(repo, ".github", "release-notes", "v1.2.3.md"), SAMPLE);
		expect(
			readCurrentReleaseNote({
				version: "1.2.3",
				isPackaged: false,
				resourcesPath: "/nope",
				cwd: join(repo, "apps", "desktop"),
			}),
		).toBe("## 新增\n\n- 新功能 A");
	});

	it("文件不存在或正文为空时返回 undefined", () => {
		const resources = makeRoot();
		mkdirSync(join(resources, "release-notes"));
		writeFileSync(join(resources, "release-notes", "v1.0.0.md"), "# Vetta 1.0.0\n");
		const base = { isPackaged: true, resourcesPath: resources, cwd: "/nope" };
		expect(readCurrentReleaseNote({ ...base, version: "9.9.9" })).toBeUndefined();
		expect(readCurrentReleaseNote({ ...base, version: "1.0.0" })).toBeUndefined();
	});
});
