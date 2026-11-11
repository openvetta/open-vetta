import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 去掉发布说明开头的「# Vetta x.y.z」标题和 release-status 标记：
 * 对话框已有自己的标题与版本号，正文只保留 `## 新增` 起的内容。
 */
export function stripReleaseNoteHeader(markdown: string): string {
	return markdown
		.replace(/\r\n/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/^\s*# [^\n]*\n/, "")
		.trim();
}

/**
 * 当前版本的发布说明（Markdown，已去掉标题）。
 * 打包后由 prepare-pack 放进 Resources/release-notes/；开发态直接读仓库里的
 * .github/release-notes（cwd 为 apps/desktop）。找不到或为空时返回 undefined。
 */
export function readCurrentReleaseNote(options: {
	readonly version: string;
	readonly isPackaged: boolean;
	readonly resourcesPath: string;
	readonly cwd: string;
}): string | undefined {
	const fileName = `v${options.version}.md`;
	const filePath = options.isPackaged
		? join(options.resourcesPath, "release-notes", fileName)
		: join(options.cwd, "..", "..", ".github", "release-notes", fileName);
	if (!existsSync(filePath)) return undefined;
	try {
		return stripReleaseNoteHeader(readFileSync(filePath, "utf-8")) || undefined;
	} catch {
		return undefined;
	}
}
