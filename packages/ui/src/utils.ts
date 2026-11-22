import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export type { ClassValue };

export function cn(...parts: ClassValue[]): string {
	return twMerge(clsx(parts));
}

/**
 * 所有弹出层（Dialog、Drawer、Splash、确认框等）蒙层的统一样式：淡色压暗 + 模糊背景。
 * 新增弹出层请直接用它，不要再各写一套，否则不同弹窗的蒙层会越长越分叉。
 *
 * 其中的 `overlay-backdrop` 是给全局样式用的标记类：macOS 经典侧边栏为透出原生毛玻璃而
 * 半透明，backdrop-filter 模糊出来的结果也是半透明的，会盖不住底下清晰的文字；styles.css
 * 在有蒙层时把侧边栏临时换成实色，见 `:has(.overlay-backdrop)` 那条规则。
 */
export const OVERLAY_BACKDROP_CLASS = "overlay-backdrop bg-black/20 backdrop-blur-md";

/**
 * 浮层面板（Dialog、Splash）统一的柔和外投影：用两层低透明度的影子托起面板，
 * 代替边框线。一层小半径的近影加一层低透明度的环境影；影子越大越淡越容易发灰发脏，所以宁小勿大。
 */
export const PANEL_SHADOW_CLASS = "shadow-[0_16px_40px_-12px_rgb(0_0_0/0.10),0_2px_8px_-2px_rgb(0_0_0/0.05)]";

/**
 * 大块玻璃面板（命令面板这类 Splash）：与 `ButtonGroup` 同一套玻璃语言——用前景色 / 白色的低透明度
 * 叠层而不是实色底，外缘靠内阴影（上沿亮线、下沿淡线、一圈极淡的内辉光）而不是均匀描边，深色再加一层投影。
 * 面板比按钮组大得多、上面压着成段文字，所以叠层比按钮组厚，背景模糊也更重，保证正文可读。
 *
 * 浅色单独调：白底上「半透明白 + 白色高光」几乎看不出层次，会显得是一块平板。所以浅色用
 * 更通透的白叠层配更强的饱和度，让背后的颜色透上来；外缘是一圈白色内高光加一圈极淡的暗描边，
 * 再用两层投影把面板托离背景（近处一层收紧、远处一层铺开），玻璃的厚度感主要来自这里。
 */
export const GLASS_PANEL_CLASS = [
	"bg-white/55 backdrop-blur-2xl backdrop-saturate-[1.8]",
	"shadow-[inset_0_1px_0_rgb(255_255_255/0.95),inset_0_0_0_1px_rgb(255_255_255/0.55),0_0_0_1px_rgb(0_0_0/0.07),0_10px_24px_-10px_rgb(0_0_0/0.16),0_32px_72px_-20px_rgb(0_0_0/0.28)]",
	"dark:bg-[color-mix(in_srgb,var(--popover)_62%,transparent)] dark:backdrop-saturate-150",
	"dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.22),inset_0_-1px_0_rgb(255_255_255/0.1),inset_0_0_0_1px_rgb(255_255_255/0.06),inset_0_0_32px_rgb(255_255_255/0.04),0_24px_64px_rgb(0_0_0/0.45)]",
].join(" ");

/**
 * 所有下拉 / 弹出面板（Popover、DropdownMenu、Select 的内容面）的统一外观：
 * 无外边框、大圆角、共用柔和投影。三个基础组件都从这里取，调用方不要再自己写
 * `border` / `rounded-*` / `shadow-*`，否则会和全局风格分叉。
 */
// 深色模式下投影几乎看不见，面板底色又与页面背景只差十几档灰阶，没有边框就会糊在一起，
// 所以深色补一圈极淡的 1px 描边（浅色模式仍然无线）。
export const FLOATING_SURFACE_CLASS = `rounded-2xl bg-popover text-popover-foreground dark:ring-1 dark:ring-white/10 ${PANEL_SHADOW_CLASS}`;

/**
 * 毛玻璃浮层底色：半透明的主题底色 + 背景模糊，真正透出面板背后的内容，只留柔和的轮廓。
 * 底色仍用主题的 background 变量，搜索行等没有自己底色的子元素因此和面板融成一块；
 * 不要再叠自绘的描边/高光去“假装”玻璃。
 * 深色下抬高底色不透明度并压暗背景亮度，否则背后的大块亮色透出来会很刺眼。
 *
 * 用在 FLOATING_SURFACE_CLASS 之后：`bg-background/40` 会盖掉其中的 `bg-popover`。
 */
export const FROSTED_SURFACE_CLASS =
	"bg-background/40 backdrop-blur-2xl backdrop-saturate-150 dark:bg-background/75 dark:backdrop-brightness-50";
