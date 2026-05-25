import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";

interface SyntaxHighlightedCodeProps {
	code: string;
	lang: string;
	theme: "light" | "dark";
}

/**
 * Renders a code block with Shiki syntax highlighting.
 * Uses an async useEffect + codeToHtml pattern, mirroring CodePreview.tsx.
 * Shows plain text fallback during loading or on error.
 */
export function SyntaxHighlightedCode({ code, lang, theme }: SyntaxHighlightedCodeProps) {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const language = lang || "text";

		codeToHtml(code, {
			lang: language,
			theme: theme === "dark" ? "github-dark-default" : "github-light-default",
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch(() => {
				if (!cancelled) setHtml("");
			});

		return () => {
			cancelled = true;
		};
	}, [code, lang, theme]);

	if (html === null) {
		// Loading state — render plain text
		return (
			<pre className="overflow-x-auto p-3">
				<code className="text-[12px] leading-[1.6] text-foreground">{code}</code>
			</pre>
		);
	}

	if (html === "") {
		// Fallback on error
		return (
			<pre className="overflow-x-auto p-3">
				<code className="text-[12px] leading-[1.6] text-foreground">{code}</code>
			</pre>
		);
	}

	return (
		<div
			className="overflow-x-auto text-[12px] leading-[1.6] [&_pre]:!bg-transparent [&_pre]:!p-3 [&_code]:!bg-transparent"
			// biome-ignore lint/security/noDangerouslySetInnerHtml: shiki generates safe HTML
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
