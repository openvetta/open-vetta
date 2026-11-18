import { useAtom } from "jotai";
import { useCallback } from "react";
import { chatBackgroundAtom } from "../store/ui-atoms";
import { type ChatBackgroundId, setStoredChatBackgroundId } from "../theme/chat-background";

/** 对话页背景的选择；与纹理/装饰件一致：写 localStorage + 同步 atom。 */
export function useChatBackground() {
	const [backgroundId, setBackgroundAtom] = useAtom(chatBackgroundAtom);

	const setBackground = useCallback(
		(value: ChatBackgroundId) => {
			setStoredChatBackgroundId(value);
			setBackgroundAtom(value);
		},
		[setBackgroundAtom],
	);

	return { backgroundId, setBackground };
}
