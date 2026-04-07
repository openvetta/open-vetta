interface JourneyPanelProps {
	cwd: string;
}

export function JourneyPanel({ cwd: _cwd }: JourneyPanelProps): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/50">
			<span className="icon-[mdi--timeline-outline] text-[32px]" />
			<span className="text-[12px]">历程面板（占位）</span>
		</div>
	);
}
