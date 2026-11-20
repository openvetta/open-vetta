/**
 * 双语发布说明按界面语言取一段。
 *
 * `.github/release-notes/v<版本>.md` 同时是 GitHub Release 正文和安装包里的「本版本功能」：
 * Release 页面上「## English」「## 中文」两段都显示，应用内只显示用户看得懂的那一段。
 * 旧版本的说明没有语言分段，原样返回，保持原有行为。
 */

export type ReleaseNoteLanguage = "zh" | "en";

const LANGUAGE_BY_HEADING: Record<string, ReleaseNoteLanguage> = { english: "en", 中文: "zh" };

const FOOTER = /^\*\*Full Changelog\*\*:/;

export function selectReleaseNoteLanguage(markdown: string, language: ReleaseNoteLanguage): string {
	const blocks = new Map<ReleaseNoteLanguage, string[]>();
	let current: ReleaseNoteLanguage | null = null;
	let hasLanguageHeadings = false;

	for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
		const heading = /^##\s+(.+?)\s*$/.exec(line);
		const key = heading ? LANGUAGE_BY_HEADING[heading[1].trim().toLowerCase()] : undefined;
		if (key) {
			hasLanguageHeadings = true;
			current = key;
			blocks.set(key, []);
			continue;
		}
		// 段外内容（标题、发布状态标记、文末 Full Changelog）不属于任何一段。
		if (!current || FOOTER.test(line)) continue;
		blocks.get(current)?.push(line);
	}

	if (!hasLanguageHeadings) return markdown;
	const chosen = blocks.get(language) ?? blocks.get(language === "zh" ? "en" : "zh");
	return (chosen ?? []).join("\n").trim();
}
