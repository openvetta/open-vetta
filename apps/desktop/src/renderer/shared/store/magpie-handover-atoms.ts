import { atom } from "jotai";

/**
 * Magpie 接入说明弹窗的打开状态。
 * - upgrade:升级后首次启动删掉了旧版在 Vetta 里启用的 Magpie,告诉用户改去 Magpie 里接入。
 * - guide:用户在设置的 Magpie 一行主动打开的接入说明。
 */
export type MagpieHandoverDialogState =
	| { readonly reason: "upgrade"; readonly defaultModelCleared: boolean }
	| { readonly reason: "guide" };

export const magpieHandoverDialogAtom = atom<MagpieHandoverDialogState | null>(null);
