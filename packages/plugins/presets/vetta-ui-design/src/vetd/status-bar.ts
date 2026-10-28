/**
 * 这份设计的 iOS 状态栏设置。
 *
 * 为什么存进 manifest 而不是只写在提示词里：「用户说不要状态栏」是 vetd_create 那一刻
 * 最清楚的信息，之后每加一个页面都要沿用，而对话一长它就没有地方记着了（同 defaultFrameSize
 * 的处境，见 frame-size.ts）。取值就是 `@vetta/ios` 的变体，再加一个 `none`。
 */
export const STATUS_BAR_SETTINGS = ["island", "notch", "flat", "none"] as const;

export type StatusBarSetting = (typeof STATUS_BAR_SETTINGS)[number];

/** 用户没提状态栏时的默认：移动端界面带灵动岛。 */
export const DEFAULT_STATUS_BAR: StatusBarSetting = "island";

/**
 * 创建时的设置。显式值优先；手机界面没给就是默认的灵动岛；其他品类（桌面、落地页、
 * 海报）没有状态栏这回事，返回 null，不往 manifest 里写。
 */
export function resolveStatusBar(input: { product?: unknown; statusBar?: unknown }): StatusBarSetting | null {
	const explicit = input.statusBar;
	if (typeof explicit === "string" && (STATUS_BAR_SETTINGS as readonly string[]).includes(explicit)) {
		return explicit as StatusBarSetting;
	}
	return input.product === "mobile" ? DEFAULT_STATUS_BAR : null;
}

/** vetd_create 结果里的那句话：每个手机画框怎么写状态栏。`none` 则明确告诉 agent 不要画。 */
export function statusBarNote(setting: StatusBarSetting): string {
	if (setting === "none") {
		return " This design has NO status bar (the user did not want one): do not draw one, and do not reserve space for it.";
	}
	return ` Every phone screen carries the iOS status bar (${setting}): \`import { StatusBar } from "@vetta/ios"\` and render <StatusBar variant="${setting}" tone="dark" /> as the first child of the frame (tone="light" on a dark screen). It takes the safe-area height itself — keep content and controls below it, and never draw your own clock, signal, Wi-Fi, battery, notch or island. A hero picture that runs under the status bar uses \`overlay\`.`;
}
