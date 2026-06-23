const EXTENSION_ICONS: Record<string, string> = {
	// JavaScript / TypeScript
	ts: "icon-[mdi--language-typescript]",
	tsx: "icon-[mdi--language-typescript]",
	js: "icon-[mdi--language-javascript]",
	jsx: "icon-[mdi--language-javascript]",
	mjs: "icon-[mdi--language-javascript]",
	cjs: "icon-[mdi--language-javascript]",
	// Web
	html: "icon-[mdi--language-html5]",
	css: "icon-[mdi--language-css3]",
	scss: "icon-[mdi--language-css3]",
	less: "icon-[mdi--language-css3]",
	svg: "icon-[mdi--svg]",
	// Data / Config
	json: "icon-[mdi--code-json]",
	yaml: "icon-[mdi--file-cog-outline]",
	yml: "icon-[mdi--file-cog-outline]",
	toml: "icon-[mdi--file-cog-outline]",
	xml: "icon-[mdi--xml]",
	env: "icon-[mdi--file-lock-outline]",
	// Languages
	py: "icon-[mdi--language-python]",
	go: "icon-[mdi--language-go]",
	rs: "icon-[mdi--language-rust]",
	java: "icon-[mdi--language-java]",
	kt: "icon-[mdi--language-kotlin]",
	swift: "icon-[mdi--language-swift]",
	rb: "icon-[mdi--language-ruby]",
	php: "icon-[mdi--language-php]",
	c: "icon-[mdi--language-c]",
	cpp: "icon-[mdi--language-cpp]",
	h: "icon-[mdi--language-c]",
	cs: "icon-[mdi--language-csharp]",
	// Docs
	md: "icon-[mdi--language-markdown]",
	mdx: "icon-[mdi--language-markdown]",
	txt: "icon-[mdi--file-document-outline]",
	pdf: "icon-[mdi--file-pdf-box]",
	// Images
	png: "icon-[mdi--file-image-outline]",
	jpg: "icon-[mdi--file-image-outline]",
	jpeg: "icon-[mdi--file-image-outline]",
	gif: "icon-[mdi--file-image-outline]",
	webp: "icon-[mdi--file-image-outline]",
	ico: "icon-[mdi--file-image-outline]",
	// Shell
	sh: "icon-[mdi--console]",
	bash: "icon-[mdi--console]",
	zsh: "icon-[mdi--console]",
	// Lock / Build
	lock: "icon-[mdi--lock-outline]",
};

const FILENAME_ICONS: Record<string, string> = {
	"package.json": "icon-[mdi--nodejs]",
	"tsconfig.json": "icon-[mdi--language-typescript]",
	".gitignore": "icon-[mdi--git]",
	".gitmodules": "icon-[mdi--git]",
	Dockerfile: "icon-[mdi--docker]",
	"docker-compose.yml": "icon-[mdi--docker]",
	"docker-compose.yaml": "icon-[mdi--docker]",
	Makefile: "icon-[mdi--cog-outline]",
	LICENSE: "icon-[mdi--certificate-outline]",
	README: "icon-[mdi--book-open-variant]",
	"README.md": "icon-[mdi--book-open-variant]",
};

/**
 * 多彩品牌图标（vscode-icons，原生配色，如 Word/Excel/PPT/PDF）。
 * 用于知识库宫格等需要一眼识别文件类型的场景；注意这些是多色图标，
 * 由 background-image 渲染，外层不要再加 text-* 颜色类（无效且多余）。
 */
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

export function getFileIcon(name: string, isDirectory: boolean, isExpanded: boolean): string {
	if (isDirectory) {
		return isExpanded ? "icon-[mdi--folder-open-outline]" : "icon-[mdi--folder-outline]";
	}

	// Check exact filename first
	if (FILENAME_ICONS[name]) return FILENAME_ICONS[name];

	// Check extension
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx > 0) {
		const ext = name.substring(dotIdx + 1).toLowerCase();
		if (EXTENSION_ICONS[ext]) return EXTENSION_ICONS[ext];
	}

	return "icon-[mdi--file-outline]";
}
