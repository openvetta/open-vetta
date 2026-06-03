import { useAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { resolvedThemeAtom, type ThemeMode, themeModeAtom, themeNameAtom } from "../store/atoms";
import {
	applyTheme,
	MODE_STORAGE_KEY,
	type ResolvedMode,
	THEME_STORAGE_KEY,
	type ThemeTransitionOptions,
	withThemeTransition,
} from "../theme/apply";

export function useTheme() {
	const [mode, setModeAtom] = useAtom(themeModeAtom);
	const [resolved, setResolved] = useAtom(resolvedThemeAtom);
	const [themeName, setThemeNameAtom] = useAtom(themeNameAtom);

	// 挂载时与 mode 变化时同步原生窗口主题 + 解析当前 mode。
	// applyInitialTheme() 已在 main.tsx 启动时写过一次 inline style，这里只做：
	// 1) auto 模式下查询原生当前是 dark 还是 light（异步，更权威）
	// 2) 通知主进程切换 nativeTheme（影响 macOS vibrancy）
	useEffect(() => {
		async function syncWithNative() {
			let isDark: boolean;
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
			const r: ResolvedMode = isDark ? "dark" : "light";
			const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) ?? "default";
			setResolved(r);
			applyTheme(r, currentTheme);
		}
		void syncWithNative();
	}, [mode, setResolved]);

	// 监听原生主题变化（auto 模式下才响应）。
	useEffect(() => {
		const unsubscribe = window.vetta.theme.onNativeChanged((info) => {
			const current = (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode | null) ?? "dark";
			if (current !== "auto") return;
			const r: ResolvedMode = info.shouldUseDarkColors ? "dark" : "light";
			const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) ?? "default";
			setResolved(r);
			applyTheme(r, currentTheme);
		});
		return unsubscribe;
	}, [setResolved]);

	const setMode = useCallback(
		async (newMode: ThemeMode, transitionOptions?: ThemeTransitionOptions) => {
			localStorage.setItem(MODE_STORAGE_KEY, newMode);

			let r: ResolvedMode;
			if (newMode === "auto") {
				await window.vetta.theme.set("system").catch(() => {});
				try {
					const native = await window.vetta.theme.getNative();
					r = native.shouldUseDarkColors ? "dark" : "light";
				} catch {
					r = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
				}
			} else {
				await window.vetta.theme.set(newMode).catch(() => {});
				r = newMode;
			}
			withThemeTransition(() => {
				setModeAtom(newMode);
				setResolved(r);
				applyTheme(r, themeName);
			}, transitionOptions);
		},
		[setModeAtom, setResolved, themeName],
	);

	useEffect(() => {
		return window.vetta.theme.onModeRequested(({ mode: requestedMode }) => {
			void setMode(requestedMode);
		});
	}, [setMode]);

	const setThemeName = useCallback(
		(name: string, transitionOptions?: ThemeTransitionOptions) => {
			localStorage.setItem(THEME_STORAGE_KEY, name);
			withThemeTransition(() => {
				setThemeNameAtom(name);
				applyTheme(resolved, name);
			}, transitionOptions);
		},
		[resolved, setThemeNameAtom],
	);

	return { mode, resolved, themeName, setMode, setThemeName };
}
