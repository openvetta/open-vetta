export interface PetSpeechBubbleMessage {
	text: string;
}

export function PetSpeechBubble({ message }: { message: PetSpeechBubbleMessage | undefined }): JSX.Element | null {
	if (!message) return null;

	return (
		<div className="pointer-events-none absolute left-1/2 top-2 z-10 max-w-[calc(100%-16px)] -translate-x-1/2 select-none">
			<div className="relative max-h-24 overflow-hidden break-words rounded-md border border-border/60 bg-popover/90 px-3 py-2 text-center text-xs font-medium leading-5 text-popover-foreground shadow-lg backdrop-blur-sm">
				{message.text}
				<div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-border/60 bg-popover/90" />
			</div>
		</div>
	);
}
