import type { DesktopThemePackage } from "@preload/api";
import { DEFAULT_THEME_MODULE, ThemeProvider, type ThemeModule } from "@vetta/theme-sdk";
import {
	createContext,
	type ErrorInfo,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { ThemeErrorBoundary } from "./ThemeErrorBoundary";
import { loadThemePackage } from "./themeLoader";
import type { ThemeRuntimeValue } from "./types";

const UI_THEME_STORAGE_KEY = "vetta-ui-theme";
const DEFAULT_UI_THEME_ID = "default";
const ThemeRuntimeContext = createContext<ThemeRuntimeValue | null>(null);

export function ThemeRuntimeProvider({ children }: { children: ReactNode }): JSX.Element {
	const [activeTheme, setActiveTheme] = useState<ThemeModule>(DEFAULT_THEME_MODULE);
	const [availableThemes, setAvailableThemes] = useState<DesktopThemePackage[]>([]);
	const [status, setStatus] = useState<ThemeRuntimeValue["status"]>("loading");
	const disposeRef = useRef<() => void>(() => {});

	const selectTheme = useCallback(async (themeId: string): Promise<void> => {
		const themes = await window.vetta.themes.list();
		setAvailableThemes(themes);
		if (themeId === DEFAULT_THEME_MODULE.meta.id) {
			disposeRef.current();
			disposeRef.current = () => {};
			localStorage.setItem(UI_THEME_STORAGE_KEY, DEFAULT_THEME_MODULE.meta.id);
			setActiveTheme(DEFAULT_THEME_MODULE);
			setStatus("ready");
			return;
		}
		const descriptor = themes.find((theme) => theme.id === themeId);
		if (!descriptor) {
			disposeRef.current();
			disposeRef.current = () => {};
			localStorage.setItem(UI_THEME_STORAGE_KEY, DEFAULT_THEME_MODULE.meta.id);
			setActiveTheme(DEFAULT_THEME_MODULE);
			setStatus("error");
			return;
		}
		setStatus("loading");
		try {
			const loaded = await loadThemePackage(descriptor);
			disposeRef.current();
			disposeRef.current = loaded.dispose;
			localStorage.setItem(UI_THEME_STORAGE_KEY, descriptor.id);
			setActiveTheme(loaded.module);
			setStatus("ready");
		} catch (error) {
			console.error(`Failed to load theme "${themeId}"`, error);
			disposeRef.current();
			disposeRef.current = () => {};
			setActiveTheme(DEFAULT_THEME_MODULE);
			setStatus("error");
		}
	}, []);

	useEffect(() => {
		const storedThemeId = localStorage.getItem(UI_THEME_STORAGE_KEY) ?? DEFAULT_UI_THEME_ID;
		void selectTheme(storedThemeId);
		return () => disposeRef.current();
	}, [selectTheme]);

	const handleThemeRenderError = useCallback(
		(error: Error, info: ErrorInfo): void => {
			console.error(`Theme "${activeTheme.meta.id}" failed to render`, error, info);
			disposeRef.current();
			disposeRef.current = () => {};
			setActiveTheme(DEFAULT_THEME_MODULE);
			setStatus("error");
		},
		[activeTheme.meta.id],
	);

	const value = useMemo<ThemeRuntimeValue>(
		() => ({
			activeThemeId: activeTheme.meta.id,
			availableThemes: availableThemes.map((theme) => ({
				id: theme.id,
				source: theme.source,
				version: theme.version,
				sdkVersion: theme.sdkVersion,
				displayName: theme.displayName,
				entryUrl: theme.entryUrl,
			})),
			selectTheme,
			status,
		}),
		[activeTheme.meta.id, availableThemes, selectTheme, status],
	);

	return (
		<ThemeRuntimeContext.Provider value={value}>
			<ThemeProvider theme={activeTheme}>
				<ThemeErrorBoundary key={activeTheme.meta.id} onError={handleThemeRenderError}>
					{children}
				</ThemeErrorBoundary>
			</ThemeProvider>
		</ThemeRuntimeContext.Provider>
	);
}

export function useThemeRuntime(): ThemeRuntimeValue {
	const value = useContext(ThemeRuntimeContext);
	if (!value) throw new Error("useThemeRuntime must be used within ThemeRuntimeProvider");
	return value;
}
