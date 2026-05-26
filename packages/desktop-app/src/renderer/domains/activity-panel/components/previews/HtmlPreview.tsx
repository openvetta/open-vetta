import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";
import { useState } from "react";
import { CodePreview } from "./CodePreview";

type Mode = "preview" | "code";

const TOGGLE_ITEMS: SegmentedControlItem<Mode>[] = [
	{ key: "preview", label: "预览" },
	{ key: "code", label: "代码" },
];

interface HtmlPreviewProps {
	content: string;
	extension: string;
	theme: "light" | "dark";
}

export function HtmlPreview({ content, extension, theme }: HtmlPreviewProps): JSX.Element {
	const [mode, setMode] = useState<Mode>("preview");
	const srcDoc = `<style>:root{color-scheme:${theme}}</style>${content}`;

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center justify-center border-b border-border/40 px-4 py-2">
				<SegmentedControl items={TOGGLE_ITEMS} value={mode} onChange={setMode} />
			</div>
			{mode === "preview" ? (
				<iframe
					title="HTML 预览"
					srcDoc={srcDoc}
					sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
					className="min-h-0 flex-1 border-0 bg-white"
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<CodePreview content={content} extension={extension} theme={theme} />
				</div>
			)}
		</div>
	);
}
