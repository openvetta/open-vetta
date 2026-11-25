import type { ButtonGroupVariant } from "@vetta-org/ui/button-group";
import { detectKbdPlatform } from "./kbd-keys";

/**
 * 侧边栏底部与标题栏右侧这两处常驻按钮组的外观。
 * Windows 的窗口 chrome 由 DWM 平涂，常驻的胶囊底贴在纯色墙面上会显得像一块贴片，
 * 所以那里用幽灵按钮组，只有悬停 / 选中项有底色；其余平台维持玻璃（openvetta/open-vetta#88）。
 */
export const chromeButtonGroupVariant: ButtonGroupVariant = detectKbdPlatform() === "windows" ? "ghost" : "glass";
