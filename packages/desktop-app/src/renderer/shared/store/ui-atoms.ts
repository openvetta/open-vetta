import { DEFAULT_THEME_ID } from "@shared/theme/themes";
import { atom } from "jotai";
import type { ReactNode } from "react";

// ─── Page header overrides ───
// Pages can set these to override the default route-based title and inject
// custom right-side action buttons into the global PageHeader.
export const pageHeaderTitleAtom = atom<string | null>(null);
export const pageHeaderRightSlotAtom = atom<ReactNode | null>(null);
// 设为 true 时彻底隐藏顶栏标题（连路由兜底标题也不显示），用于 NewSessionPage 等。
export const pageHeaderTitleHiddenAtom = atom<boolean>(false);

// ─── Settings page ───

export type SettingsTab =
	| "general"
	| "appearance"
	| "account"
	| "models"
	| "mcp"
	| "environment"
	| "permissions"
	| "im"
	| "webhook"
	| "shortcuts"
	| "archive"
	| "team"
	| "context"
	| "plugins"
	| "knowledge";

// ─── Theme ───

export type ThemeMode = "light" | "dark" | "auto";
export const themeModeAtom = atom<ThemeMode>((localStorage.getItem("vetta-theme") as ThemeMode) || "dark");
export const resolvedThemeAtom = atom<"light" | "dark">("dark");
export const themeNameAtom = atom<string>(localStorage.getItem("vetta-color-theme") || DEFAULT_THEME_ID);

// ─── Confirm dialog ───

export interface ConfirmDialogState {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "default";
	onConfirm: () => void;
	onCancel?: () => void;
}

export const confirmDialogAtom = atom<ConfirmDialogState | null>(null);

export interface SandboxPermissionDrawerState {
	requestId: string;
	title: string;
	message: string;
	/** True when the request is for a sensitive deny-root path; UI must hide the "allow for session" button. */
	sensitive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	onAllowSession?: () => void;
}

export const sandboxPermissionDrawerAtom = atom<SandboxPermissionDrawerState | null>(null);
