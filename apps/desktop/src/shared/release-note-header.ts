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

/**
 * 跨多个版本更新时把每一版的说明拼在一起（传入时已按版本从新到旧排好、已去掉各自标题）。
 * 只有一版时只给正文（对话框已有版本标题）；多版时用版本号分节，否则分不清哪条属于哪一版。
 */
export function joinReleaseNotesByVersion(
	notes: ReadonlyArray<{ readonly version: string; readonly body: string }>,
): string | undefined {
	const present = notes.filter((item) => item.body.length > 0);
	if (present.length === 0) return undefined;
	if (present.length === 1) return present[0]?.body;
	return present.map((item) => `# Vetta ${item.version}\n\n${item.body}`).join("\n\n");
}
