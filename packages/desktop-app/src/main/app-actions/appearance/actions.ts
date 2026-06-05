import type { ActionDefinition } from "../types.js";
import { themeAction } from "./theme.action.js";

export function registerAppearanceActions(register: (action: ActionDefinition) => void): void {
	register(themeAction);
}
