import { useAtom } from "jotai";
import { useCallback } from "react";
import { customCursorAtom } from "../store/atoms";
import { applyCustomCursor, CURSOR_STORAGE_KEY } from "../theme/cursor";

export function useCustomCursor() {
	const [enabled, setEnabledAtom] = useAtom(customCursorAtom);

	const setEnabled = useCallback(
		(value: boolean) => {
			localStorage.setItem(CURSOR_STORAGE_KEY, String(value));
			applyCustomCursor(value);
			setEnabledAtom(value);
		},
		[setEnabledAtom],
	);

	return { enabled, setEnabled };
}
