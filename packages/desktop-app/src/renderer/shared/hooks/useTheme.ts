import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { resolvedThemeAtom, type ThemeMode, themeModeAtom } from "../store/atoms";

function applyTheme(resolved: "light" | "dark"): void {
	document.documentElement.setAttribute("data-theme", resolved);
}

export function useTheme() {
	const [mode, setModeAtom] = useAtom(themeModeAtom);
	const [resolved, setResolved] = useAtom(resolvedThemeAtom);

	// On mount: resolve initial theme
	useEffect(() => {
		async function init() {
			let isDark = true;
			if (mode === "auto") {
				try {
					const native = await window.vetta.theme.getNative();
					isDark = native.shouldUseDarkColors;
				} catch {
					isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
				}
				await window.vetta.theme.set("system").catch(() => {});
			} else {
				isDark = mode === "dark";
				await window.vetta.theme.set(mode).catch(() => {});
			}
			const r = isDark ? "dark" : "light";
			setResolved(r);
			applyTheme(r);
		}
		void init();
	}, [mode, setResolved]);

	// Listen for system theme changes (for auto mode)
	useEffect(() => {
		const unsubscribe = window.vetta.theme.onNativeChanged((info) => {
			// Only react if in auto mode — read from localStorage to avoid stale closure
			const current = localStorage.getItem("vetta-theme") || "dark";
			if (current === "auto") {
				const r = info.shouldUseDarkColors ? "dark" : "light";
				setResolved(r);
				applyTheme(r);
			}
		});
		return unsubscribe;
	}, [setResolved]);

	const setMode = useCallback(
		async (newMode: ThemeMode) => {
			setModeAtom(newMode);
			localStorage.setItem("vetta-theme", newMode);

			if (newMode === "auto") {
				await window.vetta.theme.set("system").catch(() => {});
				try {
					const native = await window.vetta.theme.getNative();
					const r = native.shouldUseDarkColors ? "dark" : "light";
					setResolved(r);
					applyTheme(r);
				} catch {
					// fallback
				}
			} else {
				await window.vetta.theme.set(newMode).catch(() => {});
				setResolved(newMode);
				applyTheme(newMode);
			}
		},
		[setModeAtom, setResolved],
	);

	return { mode, resolved, setMode };
}
