import { useLayoutEffect } from "react";
import { useThemeAppearance } from "@vetta/theme-sdk/appearance";
import { applyStoredTheme, setThemeColorOverrides } from "./apply";

export function ThemeColorOverrideBridge(): null {
	const appearance = useThemeAppearance();

	useLayoutEffect(() => {
		const root = document.documentElement;
		const previousColorScheme = root.style.colorScheme;

		setThemeColorOverrides(appearance.colors);
		if (appearance.colorScheme) {
			root.style.colorScheme = appearance.colorScheme;
		}
		applyStoredTheme();

		return () => {
			setThemeColorOverrides();
			root.style.colorScheme = previousColorScheme;
			applyStoredTheme();
		};
	}, [appearance.colorScheme, appearance.colors]);

	return null;
}
