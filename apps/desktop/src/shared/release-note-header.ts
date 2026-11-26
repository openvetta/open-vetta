/**
 * 去掉发布说明开头的「# Vetta x.y.z」标题和 release-status 标记：
 * 更新对话框自己有标题与版本号，正文只保留 `## 新增` 起的内容。
 * 主进程（更新源给的说明、随包说明）与渲染进程（开发预览）共用。
 */
export function stripReleaseNoteHeader(markdown: string): string {
	return markdown
		.replace(/\r\n/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/^\s*# [^\n]*\n?/, "")
		.trim();
}

/** 某一版的发布说明正文（已按界面语言取段、已去掉标题）。 */
export interface VersionedReleaseNote {
	readonly version: string;
	readonly note: string;
}

/**
 * 跨多个版本更新时，把每一版的说明拆成「最新一版」和「更早的版本」：
 * 最新一版直接展示，更早的版本在对话框里折叠，逐版点开。
 * 传入时按版本从新到旧排好；没有正文的版本跳过。
 */
export function splitReleaseNotesByVersion(notes: ReadonlyArray<VersionedReleaseNote>): {
	readonly releaseNote?: string;
	readonly earlierReleaseNotes?: VersionedReleaseNote[];
} {
	const present = notes.filter((item) => item.note.length > 0);
	const [latest, ...earlier] = present;
	return {
		releaseNote: latest?.note,
		earlierReleaseNotes: earlier.length > 0 ? earlier : undefined,
	};
}
