import { DEFAULT_THEME_ID, getTheme } from "./themes";
import { TOKEN_CSS_VAR, type TokenSet } from "./tokens";

export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedMode = "light" | "dark";

export const MODE_STORAGE_KEY = "vetta-theme";
export const THEME_STORAGE_KEY = "vetta-color-theme";

function writeTokens(tokens: TokenSet): void {
	const style = document.documentElement.style;
	for (const key of Object.keys(TOKEN_CSS_VAR) as (keyof TokenSet)[]) {
		style.setProperty(TOKEN_CSS_VAR[key], tokens[key]);
	}
}

export function applyTheme(mode: ResolvedMode, themeId: string): void {
	const theme = getTheme(themeId);
	const tokens = mode === "dark" ? theme.dark : theme.light;
	const root = document.documentElement;
	root.setAttribute("data-mode", mode);
	root.setAttribute("data-theme", theme.id);
	writeTokens(tokens);
}

// 启动时同步调用：在 React 挂载前把主题写入 inline style，避免冷启动闪烁。
// mode = "auto" 时优先用 window.matchMedia 推测（同步、不依赖 IPC）。
export function applyInitialTheme(): void {
	const mode = (localStorage.getItem(MODE_STORAGE_KEY) as ThemeMode | null) ?? "dark";
	const themeId = localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
	let resolved: ResolvedMode;
	if (mode === "auto") {
		resolved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	} else {
		resolved = mode;
	}
	applyTheme(resolved, themeId);
}

const TRANSITION_CLASS = "theme-transitioning";
const TRANSITION_MS = 180;
let transitionTimer: number | null = null;

// 切换主题/模式时短暂启用全局 transition，让色彩柔和过渡。
export function withThemeTransition(fn: () => void): void {
	const root = document.documentElement;
	root.classList.add(TRANSITION_CLASS);
	fn();
	if (transitionTimer !== null) {
		window.clearTimeout(transitionTimer);
	}
	transitionTimer = window.setTimeout(() => {
		root.classList.remove(TRANSITION_CLASS);
		transitionTimer = null;
	}, TRANSITION_MS);
}
