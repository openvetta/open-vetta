import type { ComponentType, JSX } from "react";
import { useMemo, useState } from "react";
import type { CodePreviewProps } from "./CodePreview";
import { CodePreview } from "./CodePreview";

type Mode = "preview" | "code";

export interface HtmlPreviewSegmentItem {
	readonly key: Mode;
	readonly label: string;
}

export interface HtmlPreviewViewLabels {
	readonly preview: string;
	readonly code: string;
	readonly title: string;
}

export interface HtmlPreviewSegmentedControlProps {
	readonly items: readonly HtmlPreviewSegmentItem[];
	readonly value: Mode;
	readonly onChange: (value: Mode) => void;
}

export interface HtmlPreviewViewProps {
	readonly content: string;
	readonly extension: string;
	readonly theme: "light" | "dark";
	readonly labels: HtmlPreviewViewLabels;
	/** Host segmented control (desktop @shared). Defaults to simple button group. */
	readonly SegmentedControl?: ComponentType<HtmlPreviewSegmentedControlProps>;
	readonly CodePreviewComponent?: ComponentType<CodePreviewProps>;
}

function DefaultSegmentedControl({
	items,
	value,
	onChange,
}: HtmlPreviewSegmentedControlProps): JSX.Element {
	return (
		<div className="inline-flex rounded-lg border border-border/50 bg-muted/40 p-0.5">
			{items.map((item) => (
				<button
					key={item.key}
					type="button"
					onClick={() => onChange(item.key)}
					className={`rounded-md px-3 py-1 text-[12px] font-medium transition-colors ${
						value === item.key
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}

export function HtmlPreviewView({
	content,
	extension,
	theme,
	labels,
	SegmentedControl = DefaultSegmentedControl,
	CodePreviewComponent = CodePreview,
}: HtmlPreviewViewProps): JSX.Element {
	const [mode, setMode] = useState<Mode>("preview");
	const srcDoc = `<style>:root{color-scheme:${theme}}</style>${content}`;
	const toggleItems = useMemo<HtmlPreviewSegmentItem[]>(
		() => [
			{ key: "preview", label: labels.preview },
			{ key: "code", label: labels.code },
		],
		[labels.code, labels.preview],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
			<div className="flex shrink-0 items-center justify-center border-b border-border/40 px-4 py-2">
				<SegmentedControl items={toggleItems} value={mode} onChange={setMode} />
			</div>
			{mode === "preview" ? (
				<iframe
					title={labels.title}
					srcDoc={srcDoc}
					sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
					className="min-h-0 flex-1 border-0 bg-white"
				/>
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto">
					<CodePreviewComponent content={content} extension={extension} theme={theme} />
				</div>
			)}
		</div>
	);
}
