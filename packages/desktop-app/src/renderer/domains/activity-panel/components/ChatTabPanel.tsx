interface ChatTabPanelProps {
	cwd: string;
}

export function ChatTabPanel({ cwd: _cwd }: ChatTabPanelProps): JSX.Element {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground/50">
			<span className="icon-[mdi--message-text-outline] text-[32px]" />
			<span className="text-[12px]">聊天面板（占位）</span>
		</div>
	);
}
