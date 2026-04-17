import type { ActivityTabKey } from "@shared/lib/project-profile";
import { atom } from "jotai";

export const activityPanelOpenAtom = atom<boolean>(false);
export const activityPanelWidthAtom = atom<number>(360);

/**
 * 活动面板 active tab 按项目（cwd）记忆。
 * 切换项目后会回到该项目上次选中的 tab；新项目按 profile.defaultActivityTab 决定。
 */
export const activityPanelTabByProjectAtom = atom<Map<string, ActivityTabKey>>(new Map<string, ActivityTabKey>());
