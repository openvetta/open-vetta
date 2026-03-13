import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

const EXT_TO_LANG: Record<string, string> = {
	ts: "typescript",
	tsx: "tsx",
	js: "javascript",
	jsx: "jsx",
	mjs: "javascript",
	cjs: "javascript",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	toml: "toml",
	xml: "xml",
	html: "html",
	css: "css",
	scss: "scss",
	less: "less",
	py: "python",
	go: "go",
	rs: "rust",
	java: "java",
	kt: "kotlin",
	swift: "swift",
	rb: "ruby",
	php: "php",
	c: "c",
	cpp: "cpp",
	h: "c",
	cs: "c#",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	sql: "sql",
	graphql: "graphql",
	gql: "graphql",
	lua: "lua",
	r: "r",
	dart: "dart",
	dockerfile: "dockerfile",
	makefile: "makefile",
	env: "dotenv",
};

interface CodePreviewProps {
	content: string;
	extension: string;
	theme: "light" | "dark";
}

export function CodePreview({ content, extension, theme }: CodePreviewProps): JSX.Element {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const lang = EXT_TO_LANG[extension] ?? "text";

		codeToHtml(content, {
			lang,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				// Fallback: plain text
				if (!cancelled) setHtml("");
			});

		return () => {
			cancelled = true;
		};
	}, [content, extension, theme]);

	if (html === null) {
		return (
			<div className="flex items-center justify-center p-8">
				<span className="icon-[mdi--loading] animate-spin text-[24px] text-[var(--text-3)]" />
			</div>
		);
	}

	if (html === "") {
		// Fallback: plain text
		return (
			<pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-[1.6] text-[var(--text-1)]">
				{content}
			</pre>
		);
	}

	return (
		<div
			className="code-preview overflow-x-auto p-4 text-[12px] leading-[1.6] [&_pre]:!bg-transparent [&_code]:!bg-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
