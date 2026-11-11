import type { UpdaterState } from "@preload/api";
import { atom } from "jotai";

/**
 * 主进程 UpdaterService 的镜像状态。
 * 由 App.tsx 在挂载时通过 window.vetta.updater.onStateChanged 订阅写入。
 */
export const updaterStateAtom = atom<UpdaterState>({
	phase: "idle",
	currentVersion: "",
});

/**
 * 更新对话框（检查更新 / 新版本 / 下载进度 / 立即重启）是否打开。
 * 入口：侧栏更新图标、设置里的「检查更新」。对话框按 updaterStateAtom 的 phase 显示内容，
 * 不再只在 ready 时才可见。
 */
export const updaterRestartDialogOpenAtom = atom<boolean>(false);

/** 「版本介绍」对话框（当前版本的发布说明）是否打开；与更新对话框复用同一个视图，优先显示。 */
export const updaterCurrentNotesDialogOpenAtom = atom<boolean>(false);
