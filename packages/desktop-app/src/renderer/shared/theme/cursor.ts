export const CURSOR_STORAGE_KEY = "vetta-custom-cursor";

const CURSOR_CLASS = "custom-cursor";

// 默认关闭：仅当显式存储 "true" 时才启用自定义鼠标指针。
export function isCustomCursorEnabled(): boolean {
	return localStorage.getItem(CURSOR_STORAGE_KEY) === "true";
}

export function applyCustomCursor(enabled: boolean): void {
	document.documentElement.classList.toggle(CURSOR_CLASS, enabled);
}

export function applyStoredCustomCursor(): void {
	applyCustomCursor(isCustomCursorEnabled());
}
