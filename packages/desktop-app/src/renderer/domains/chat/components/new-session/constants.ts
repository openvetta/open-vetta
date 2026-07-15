import type { SceneCardState } from "./SceneCard";

export const easeOut = [0.16, 1, 0.3, 1] as const;

export const SCENE_STATE_RANK: Record<SceneCardState, number> = {
	active: 0,
	disabled: 1,
	uninstalled: 2,
};

// 展示限额（非数据截断）：同时最多 2 组、每组最多 3 词；超出则轮播。
// 组级用步进 1 的滑动窗口（见 useGuidingWordsModel），间隔需明显短于用户停留时间，
// 否则词级 6s 轮播会让人误以为「永远只有头两个插件」。
export const GUIDING_GROUP_PAGE = 2;
export const GUIDING_WORD_PAGE = 3;
export const GUIDING_GROUP_INTERVAL = 8000;
export const GUIDING_WORD_INTERVAL = 6000;

// 引导词轮播缓动：柔和线性收尾，避免生硬切换。
export const guidingEase = [0.22, 1, 0.36, 1] as const;

// 矮窗口阈值：低于此高度时隐藏底部引导词区，并把整体下移（减小底部留白）。
export const SHORT_VIEWPORT = 720;
