// 主进程 i18next 实例：用于原生菜单（tray / pet 右键）与系统通知文案。
// 与 renderer 共享同一套 catalog（src/shared/i18n），但这里不接 react，defaultNS=main。
// 语言真相源是 ~/.vetta/desktop-config.json 的 language 字段（见 ADR-0031），
// initAppLanguage() 在 app.whenReady 内、建任何菜单之前同步调用。
// language 未写入时：每次启动按系统 locale 解析（引导页/首启默认跟随系统），不自动持久化；
// 用户在外观设置或引导页显式选择后才写入 config。

import { app } from "electron";
import i18next from "i18next";
import {
	type AppLanguage,
	DEFAULT_LANGUAGE,
	FALLBACK_LANGUAGE,
	isSupportedLanguage,
	NAMESPACES,
	resolveAppLanguageFromLocale,
	resources,
} from "../../shared/i18n/resources.js";
import { readConfigSync } from "../ipc/fs.js";

const mainI18n = i18next.createInstance();
let currentLanguage: AppLanguage = DEFAULT_LANGUAGE;

/** 读 OS 系统 locale（优先 getSystemLocale，回退 getLocale）。 */
function readSystemLocale(): string {
	try {
		const system = typeof app.getSystemLocale === "function" ? app.getSystemLocale() : "";
		if (system) return system;
	} catch {
		// ignore
	}
	try {
		return app.getLocale() || "";
	} catch {
		return "";
	}
}

/**
 * 同步初始化主进程语言：
 * - desktop-config.language 已设置 → 用用户选择
 * - 未设置 → 跟随系统 locale（中文族 zh，其余 en）；系统不可读时 DEFAULT_LANGUAGE
 */
export function initAppLanguage(): void {
	const stored = readConfigSync().language;
	currentLanguage = isSupportedLanguage(stored) ? stored : resolveAppLanguageFromLocale(readSystemLocale());
	// initAsync:false 强制同步初始化（i18next 默认把资源装载推到 setTimeout，
	// 那样 init 返回后 isInitialized 仍为 false、t() 暂吐 key）。资源已静态内联，
	// 同步装载无 IO 成本，保证 init 返回即可用——后续 mainT() 立刻拿到译文。
	void mainI18n.init({
		resources,
		lng: currentLanguage,
		fallbackLng: FALLBACK_LANGUAGE,
		ns: NAMESPACES,
		defaultNS: "main",
		initAsync: false,
		interpolation: { escapeValue: false },
	});
}

export function getAppLanguage(): AppLanguage {
	return currentLanguage;
}

/** 切换主进程语言（菜单/通知文案随之变）。持久化与广播由 ipc/i18n.ts 负责。 */
export function setAppLanguage(lang: AppLanguage): void {
	currentLanguage = lang;
	void mainI18n.changeLanguage(lang);
}

/**
 * 主进程取文案。key 默认走 main ns（如 "tray.showWindow"），可 "common:..." 跨 ns。
 * 全局类型增强（CustomTypeOptions）把 t 收紧到 renderer 的字面量 key，主进程是动态取值，
 * 故在此用一处函数型断言放开——不引入 any，仅放宽签名。
 */
export function mainT(key: string, options?: Record<string, unknown>): string {
	// 必须在调用时取 mainI18n.t：init() 会重新绑定 .t，模块加载期捕获会拿到 init 前的桩。
	const t = mainI18n.t as unknown as (key: string, options?: Record<string, unknown>) => string;
	return t(key, options);
}
