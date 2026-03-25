import { useCallback, useEffect, useRef, useState } from "react";
import { matchesShortcut } from "../lib/platform";
import {
	getEffectiveShortcut,
	loadShortcuts,
	SHORTCUT_ACTIONS,
	type ShortcutMap,
	saveShortcuts,
} from "../lib/shortcuts";

export type ShortcutHandler = (actionId: string) => void;

/**
 * Global keyboard shortcut listener.
 *
 * Registers a single keydown handler that checks all defined shortcuts
 * and calls the handler when a match is found.
 */
export function useGlobalShortcuts(handler: ShortcutHandler): {
	customShortcuts: ShortcutMap;
	setCustomShortcut: (actionId: string, shortcut: string) => void;
	resetShortcut: (actionId: string) => void;
	resetAll: () => void;
} {
	const [customShortcuts, setCustomShortcuts] = useState<ShortcutMap>(loadShortcuts);
	const handlerRef = useRef(handler);
	const customRef = useRef(customShortcuts);
	handlerRef.current = handler;
	customRef.current = customShortcuts;

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			// Skip if user is typing in an input/textarea (unless it's a global shortcut with mod key)
			const target = e.target as HTMLElement;
			const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

			const hasMod = navigator.platform.toUpperCase().includes("MAC") ? e.metaKey : e.ctrlKey;

			if (isInput && !hasMod) return;

			for (const action of SHORTCUT_ACTIONS) {
				const effective = getEffectiveShortcut(action.id, customRef.current);
				if (effective && matchesShortcut(e, effective)) {
					e.preventDefault();
					e.stopPropagation();
					handlerRef.current(action.id);
					return;
				}
			}
		}

		document.addEventListener("keydown", handleKeyDown, true);
		return () => document.removeEventListener("keydown", handleKeyDown, true);
	}, []);

	const setCustomShortcut = useCallback((actionId: string, shortcut: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev, [actionId]: shortcut };
			saveShortcuts(next);
			return next;
		});
	}, []);

	const resetShortcut = useCallback((actionId: string) => {
		setCustomShortcuts((prev) => {
			const next = { ...prev };
			delete next[actionId];
			saveShortcuts(next);
			return next;
		});
	}, []);

	const resetAll = useCallback(() => {
		setCustomShortcuts({});
		saveShortcuts({});
	}, []);

	return { customShortcuts, setCustomShortcut, resetShortcut, resetAll };
}
