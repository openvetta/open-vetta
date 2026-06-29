import type { PetBubbleStyleId } from "../../../../shared/pet-bubbles";
import { PetBubbleFrame } from "../../../shared/components/pet/PetBubbleFrame";

export interface PetSpeechBubbleMessage {
	text: string;
}

export function PetSpeechBubble({
	decorUrl,
	message,
	placement,
	styleId,
}: {
	decorUrl: string | undefined;
	message: PetSpeechBubbleMessage | undefined;
	placement: "above" | "below";
	styleId: PetBubbleStyleId;
}): JSX.Element | null {
	if (!message) return null;

	return (
		<div
			className={`pointer-events-none absolute left-1/2 z-10 max-w-[min(360px,calc(100vw-24px))] -translate-x-1/2 select-none ${
				placement === "above" ? "bottom-full" : "top-full"
			}`}
		>
			<PetBubbleFrame
				decorUrl={decorUrl}
				styleId={styleId}
			>
				{message.text}
			</PetBubbleFrame>
		</div>
	);
}
