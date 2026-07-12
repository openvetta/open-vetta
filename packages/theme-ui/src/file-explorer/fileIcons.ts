const EXTENSION_ICONS: Record<string, string> = {
	ts: "icon-[mdi--language-typescript]",
	tsx: "icon-[mdi--language-typescript]",
	js: "icon-[mdi--language-javascript]",
	jsx: "icon-[mdi--language-javascript]",
	mjs: "icon-[mdi--language-javascript]",
	cjs: "icon-[mdi--language-javascript]",
	html: "icon-[mdi--language-html5]",
	css: "icon-[mdi--language-css3]",
	scss: "icon-[mdi--language-css3]",
	less: "icon-[mdi--language-css3]",
	svg: "icon-[mdi--svg]",
	json: "icon-[mdi--code-json]",
	yaml: "icon-[mdi--file-cog-outline]",
	yml: "icon-[mdi--file-cog-outline]",
	toml: "icon-[mdi--file-cog-outline]",
	xml: "icon-[mdi--xml]",
	env: "icon-[mdi--file-lock-outline]",
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
	md: "icon-[mdi--language-markdown]",
	mdx: "icon-[mdi--language-markdown]",
	txt: "icon-[mdi--file-document-outline]",
	pdf: "icon-[mdi--file-pdf-box]",
	png: "icon-[mdi--file-image-outline]",
	jpg: "icon-[mdi--file-image-outline]",
	jpeg: "icon-[mdi--file-image-outline]",
	gif: "icon-[mdi--file-image-outline]",
	webp: "icon-[mdi--file-image-outline]",
	ico: "icon-[mdi--file-image-outline]",
	sh: "icon-[mdi--console]",
	bash: "icon-[mdi--console]",
	zsh: "icon-[mdi--console]",
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

export function getFileIcon(name: string, isDirectory: boolean, isExpanded: boolean): string {
	if (isDirectory) {
		return isExpanded ? "icon-[mdi--folder-open-outline]" : "icon-[mdi--folder-outline]";
	}
	if (FILENAME_ICONS[name]) return FILENAME_ICONS[name];
	const dotIdx = name.lastIndexOf(".");
	if (dotIdx > 0) {
		const ext = name.substring(dotIdx + 1).toLowerCase();
		if (EXTENSION_ICONS[ext]) return EXTENSION_ICONS[ext];
	}
	return "icon-[mdi--file-outline]";
}
