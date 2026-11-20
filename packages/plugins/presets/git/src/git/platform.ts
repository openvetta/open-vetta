/**
 * 插件运行在渲染进程里，没有 Node 的 `process.platform`；宿主的渲染进程也只在 Electron 沙箱内。
 * 这里用渲染进程本来就能看到的 `navigator` 判平台，只用于挑选文案（「在访达中显示」 vs
 * 「在文件管理器中显示」），不参与任何路径处理，判错最多是措辞不地道。
 *
 * `navigator.userAgentData.platform` 比已废弃的 `navigator.platform` 更准确，但只有
 * Chromium 系提供；用户代理字符串是最后的兜底。
 */
interface UserAgentData {
	readonly platform?: string;
}

export function detectMac(nav: Pick<Navigator, "platform" | "userAgent"> & { userAgentData?: UserAgentData }): boolean {
	const hint = [nav.userAgentData?.platform, nav.platform, nav.userAgent].filter(
		(value): value is string => typeof value === "string" && value.length > 0,
	);
	return hint.some((value) => /mac/i.test(value));
}

/** 本机是否 macOS / Darwin。每次调用都读当前值，便于测试替换 `navigator`。 */
export function isMac(): boolean {
	if (typeof navigator === "undefined") return false;
	return detectMac(navigator as Navigator & { userAgentData?: UserAgentData });
}
