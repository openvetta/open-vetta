import type { ThemeDef } from "../tokens";
import { defaultTheme } from "./default";

// 「暖砂」主题：取自 tweakcn claude。
// 赭红主色（oklch 39 色相）配米白暖纸背景，气质温润沉稳，
// 是 Anthropic 视觉语言的标志性暖陶土调。

export const sandTheme: ThemeDef = {
	id: "sand",
	label: "默认",
	dark: {
		...defaultTheme.dark,
		background: "oklch(0.2679 0.0036 106.6427)",
		foreground: "oklch(0.8074 0.0142 93.0137)",
		// 比 background 略亮一档的悬浮面：输入栏、卡片等用 bg-card 的元素需要从背景中浮起。
		card: "oklch(0.3085 0.0035 106.6039)",
		cardForeground: "oklch(0.9818 0.0054 95.0986)",
		popover: "oklch(0.3085 0.0035 106.6039)",
		popoverForeground: "oklch(0.9211 0.0040 106.4781)",
		primary: "oklch(0.6724 0.1308 38.7559)",
		primaryForeground: "oklch(1.0000 0 0)",
		// 暖色深面：原 claude 深色把 secondary 设成近白色，与浅色 text-foreground 撞色看不清。
		// 这里改成略高于 card 的暖灰深面，配浅色前景文字。
		secondary: "oklch(0.3300 0.0050 106.6039)",
		secondaryForeground: "oklch(0.8074 0.0142 93.0137)",
		muted: "oklch(0.2213 0.0038 106.7070)",
		mutedForeground: "oklch(0.7713 0.0169 99.0657)",
		// 悬浮态强调面：原值比 background 更暗，导致侧边栏 hover 几乎看不出来。
		// 改成明显高于 background 的暖灰，hover 才有可见反馈。
		accent: "oklch(0.3700 0.0060 106.6039)",
		accentForeground: "oklch(0.9663 0.0080 98.8792)",
		destructive: "oklch(0.6368 0.2078 25.3313)",
		destructiveForeground: "oklch(1.0000 0 0)",
		border: "oklch(0.3618 0.0101 106.8928)",
		input: "oklch(0.4336 0.0113 100.2195)",
		ring: "oklch(0.6724 0.1308 38.7559)",
		chart1: "oklch(0.5583 0.1276 42.9956)",
		chart2: "oklch(0.6898 0.1581 290.4107)",
		chart3: "oklch(0.2130 0.0078 95.4245)",
		chart4: "oklch(0.3074 0.0516 289.3230)",
		chart5: "oklch(0.5608 0.1348 42.0584)",
		radius: "0.5rem",
	},
	light: {
		...defaultTheme.light,
		background: "oklch(0.9818 0.0054 95.0986)",
		foreground: "oklch(0.3438 0.0269 95.7226)",
		// 纯白悬浮面，从暖纸背景中浮起，让输入栏/卡片更明显。
		card: "oklch(1.0000 0 0)",
		cardForeground: "oklch(0.1908 0.0020 106.5859)",
		popover: "oklch(1.0000 0 0)",
		popoverForeground: "oklch(0.2671 0.0196 98.9390)",
		primary: "oklch(0.6171 0.1375 39.0427)",
		primaryForeground: "oklch(1.0000 0 0)",
		secondary: "oklch(0.9245 0.0138 92.9892)",
		secondaryForeground: "oklch(0.4334 0.0177 98.6048)",
		muted: "oklch(0.9341 0.0022 90.2390)",
		mutedForeground: "oklch(0.6059 0.0075 97.4233)",
		accent: "oklch(0.9245 0.0138 92.9892)",
		accentForeground: "oklch(0.2671 0.0196 98.9390)",
		destructive: "oklch(0.1908 0.0020 106.5859)",
		destructiveForeground: "oklch(1.0000 0 0)",
		border: "oklch(0.8720 0.0035 97.3627)",
		input: "oklch(0.7621 0.0156 98.3528)",
		ring: "oklch(0.6171 0.1375 39.0427)",
		chart1: "oklch(0.5583 0.1276 42.9956)",
		chart2: "oklch(0.6898 0.1581 290.4107)",
		chart3: "oklch(0.8816 0.0276 93.1280)",
		chart4: "oklch(0.8822 0.0403 298.1792)",
		chart5: "oklch(0.5608 0.1348 42.0584)",
		radius: "0.5rem",
	},
};
