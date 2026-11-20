import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripReleaseNoteHeader } from "../shared/release-note-header.js";
import { type ReleaseNoteLanguage, selectReleaseNoteLanguage } from "../shared/release-note-language.js";

export { stripReleaseNoteHeader };

/**
 * 当前版本的发布说明（Markdown，已去掉标题，只留界面语言对应的一段）。
 * 打包后由 prepare-pack 放进 Resources/release-notes/；开发态直接读仓库里的
 * .github/release-notes（cwd 为 apps/desktop）。找不到或为空时返回 undefined。
 */
export function readCurrentReleaseNote(options: {
	readonly version: string;
	readonly isPackaged: boolean;
	readonly resourcesPath: string;
	readonly cwd: string;
	readonly language: ReleaseNoteLanguage;
}): string | undefined {
	const fileName = `v${options.version}.md`;
	const filePath = options.isPackaged
		? join(options.resourcesPath, "release-notes", fileName)
		: join(options.cwd, "..", "..", ".github", "release-notes", fileName);
	if (!existsSync(filePath)) return undefined;
	try {
		const markdown = selectReleaseNoteLanguage(readFileSync(filePath, "utf-8"), options.language);
		return stripReleaseNoteHeader(markdown) || undefined;
	} catch {
		return undefined;
	}
}
