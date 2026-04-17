import { atom } from "jotai";

// ─── Settings page ───

export type SettingsTab = "general" | "account" | "models" | "mcp" | "im" | "shortcuts" | "archive" | "team";

// ─── Theme ───

export type ThemeMode = "light" | "dark" | "auto";
export const themeModeAtom = atom<ThemeMode>((localStorage.getItem("vetta-theme") as ThemeMode) || "dark");
export const resolvedThemeAtom = atom<"light" | "dark">("dark");

// ─── Confirm dialog ───

export interface ConfirmDialogState {
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	variant?: "danger" | "default";
	onConfirm: () => void;
}

export const confirmDialogAtom = atom<ConfirmDialogState | null>(null);
