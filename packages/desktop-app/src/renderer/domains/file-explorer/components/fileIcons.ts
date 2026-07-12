export { getFileIcon } from "@vetta/theme-ui/file-explorer";

/** Re-export colored icons from local implementation for knowledge-base etc. */
const COLORED_EXTENSION_ICONS: Record<string, string> = {
	doc: "icon-[vscode-icons--file-type-word]",
	docx: "icon-[vscode-icons--file-type-word]",
	xls: "icon-[vscode-icons--file-type-excel]",
	xlsx: "icon-[vscode-icons--file-type-excel]",
	csv: "icon-[vscode-icons--file-type-excel]",
	ppt: "icon-[vscode-icons--file-type-powerpoint]",
	pptx: "icon-[vscode-icons--file-type-powerpoint]",
	pdf: "icon-[vscode-icons--file-type-pdf2]",
	md: "icon-[vscode-icons--file-type-markdown]",
	mdx: "icon-[vscode-icons--file-type-markdown]",
	txt: "icon-[vscode-icons--file-type-text]",
	json: "icon-[vscode-icons--file-type-json]",
	xml: "icon-[vscode-icons--file-type-xml]",
	yaml: "icon-[vscode-icons--file-type-light-yaml]",
	yml: "icon-[vscode-icons--file-type-light-yaml]",
	html: "icon-[vscode-icons--file-type-html]",
	css: "icon-[vscode-icons--file-type-css]",
	scss: "icon-[vscode-icons--file-type-scss2]",
	ts: "icon-[vscode-icons--file-type-typescript]",
	tsx: "icon-[vscode-icons--file-type-reactts]",
	js: "icon-[vscode-icons--file-type-js-official]",
	jsx: "icon-[vscode-icons--file-type-reactjs]",
	py: "icon-[vscode-icons--file-type-python]",
	go: "icon-[vscode-icons--file-type-go]",
	rs: "icon-[vscode-icons--file-type-rust]",
	java: "icon-[vscode-icons--file-type-java]",
	png: "icon-[vscode-icons--file-type-image]",
	jpg: "icon-[vscode-icons--file-type-image]",
	jpeg: "icon-[vscode-icons--file-type-image]",
	gif: "icon-[vscode-icons--file-type-image]",
	webp: "icon-[vscode-icons--file-type-image]",
	ico: "icon-[vscode-icons--file-type-image]",
	svg: "icon-[vscode-icons--file-type-svg]",
	mp3: "icon-[vscode-icons--file-type-audio]",
	wav: "icon-[vscode-icons--file-type-audio]",
	m4a: "icon-[vscode-icons--file-type-audio]",
	flac: "icon-[vscode-icons--file-type-audio]",
	mp4: "icon-[vscode-icons--file-type-video]",
	mov: "icon-[vscode-icons--file-type-video]",
	webm: "icon-[vscode-icons--file-type-video]",
	zip: "icon-[vscode-icons--file-type-zip]",
	gz: "icon-[vscode-icons--file-type-zip]",
	tar: "icon-[vscode-icons--file-type-zip]",
	rar: "icon-[vscode-icons--file-type-zip]",
};

/** 多彩文件类型图标：目录用彩色文件夹，文件按扩展名映射品牌色图标，未知回退通用文件。 */
export function getColoredFileIcon(name: string, isDirectory: boolean, isExpanded = false): string {
	if (isDirectory) {
		return isExpanded ? "icon-[flat-color-icons--opened-folder]" : "icon-[flat-color-icons--folder]";
	}
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx > 0) {
		const ext = name.substring(dotIdx + 1).toLowerCase();
		if (COLORED_EXTENSION_ICONS[ext]) return COLORED_EXTENSION_ICONS[ext];
	}
	return "icon-[vscode-icons--default-file]";
}
