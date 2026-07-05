import "../registry";
import type { InputBarBackground } from "./InputBarBackground";

declare module "@vetta/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "chat.inputBarBackground"?: typeof InputBarBackground;
	}
}

export type { InputBarBackgroundProps } from "./InputBarBackground";
export { InputBarBackground } from "./InputBarBackground";
