export interface DesktopI18nApi {
	/**
	 * 主进程持有的当前语言（desktop-config.language；未设置则启动时按系统 locale 解析）。
	 * preload 在桥接前经 sendSync 取得，故是同步值——renderer 可在首帧前据此初始化 i18next 防闪。
	 */
	readonly initialLanguage: string;
	/** 切换语言：主进程持久化 + 重建原生菜单 + 广播 onLanguageChanged。 */
	setLanguage(lang: string): Promise<void>;
	/** 订阅主进程下发的语言变更（含本窗口自身触发的回环）。返回取消订阅函数。 */
	onLanguageChanged(handler: (lang: string) => void): () => void;
}
