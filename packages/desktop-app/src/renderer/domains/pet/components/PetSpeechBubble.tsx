import type { PetBubbleStyleId } from "../../../../shared/pet-bubbles";
import { PetBubbleFrame } from "../../../shared/components/pet/PetBubbleFrame";

export interface PetSpeechBubbleMessage {
	text: string;
}

export function PetSpeechBubble({
	decorUrl,
	message,
	styleId,
}: {
	decorUrl: string | undefined;
	message: PetSpeechBubbleMessage | undefined;
	styleId: PetBubbleStyleId;
}): JSX.Element | null {
	if (!message) return null;

	return (
		<div className="pointer-events-none absolute left-1/2 top-7 z-10 max-w-[calc(100%-52px)] -translate-x-1/2 select-none">
			<PetBubbleFrame
				decorUrl={decorUrl}
				styleId={styleId}
			>
				{message.text}
			</PetBubbleFrame>
		</div>
	);
}
