// 快捷面板独立 i18next 实例。面板窗口的 preload 只暴露 window.vettaQuickPanel，
// 不含主窗口的 window.vetta.i18n，故无法走主进程语言真相源；这里用 navigator 语言
// 兜底（zh 优先）并内联面板自己的文案目录，保持与 Group 2 文件范围自洽（见交付说明）。

import i18next from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";

const QUICK_PANEL_NS = "quickpanel";

const resources = {
	zh: {
		[QUICK_PANEL_NS]: {
			placeholder: "向 Vetta 提问…",
			recentTitle: "最近会话",
			emptyTitle: "暂无最近会话",
			emptyHint: "在上方输入即可开始新对话",
			status: {
				running: "运行中",
				pending: "待答",
			},
			time: {
				now: "刚刚",
				minutes: "{{count}} 分钟",
				hours: "{{count}} 小时",
				days: "{{count}} 天",
				weeks: "{{count}} 周",
				months: "{{count}} 个月",
				years: "{{count}} 年",
			},
		},
	},
	en: {
		[QUICK_PANEL_NS]: {
			placeholder: "Ask Vetta…",
			recentTitle: "Recent",
			emptyTitle: "No recent conversations",
			emptyHint: "Type above to start a new chat",
			status: {
				running: "Running",
				pending: "Awaiting",
			},
			time: {
				now: "just now",
				minutes: "{{count}}m",
				hours: "{{count}}h",
				days: "{{count}}d",
				weeks: "{{count}}w",
				months: "{{count}}mo",
				years: "{{count}}y",
			},
		},
	},
} as const;

function detectLanguage(): "zh" | "en" {
	const lang = navigator.language?.toLowerCase() ?? "zh";
	return lang.startsWith("en") ? "en" : "zh";
}

export const i18n = i18next.createInstance();

/** 在 React 挂载前同步调用。资源内联、同步装载，init 返回即就绪、首帧不闪。 */
export function initQuickPanelI18n(): void {
	if (i18n.isInitialized) return;
	const lng = detectLanguage();
	void i18n.use(initReactI18next).init({
		resources,
		lng,
		fallbackLng: "zh",
		ns: [QUICK_PANEL_NS],
		defaultNS: QUICK_PANEL_NS,
		initAsync: false,
		interpolation: { escapeValue: false },
		returnNull: false,
		react: { useSuspense: false },
	});
	document.documentElement.lang = lng;
}

// 项目对 i18next 做了全局类型增强（只认主窗口的 ns/key），面板用独立 ns 会被判非法 key。
// 这里把 t 收窄成面板自己的签名（双重断言绕过增强，非 any），各组件统一走此 hook。
export type QuickPanelTranslate = (key: string, options?: { count?: number }) => string;

export function useQuickPanelTranslation(): QuickPanelTranslate {
	const { t } = useTranslation();
	return t as unknown as QuickPanelTranslate;
}
