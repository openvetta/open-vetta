interface TextBlockProps {
	text: string;
}

export function TextBlockView({ text }: TextBlockProps): JSX.Element {
	return (
		<div className="whitespace-pre-wrap break-words text-[13px] leading-[1.6] text-[var(--text-1)]">
			{text}
		</div>
	);
}
