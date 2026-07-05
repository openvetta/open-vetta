import type { ThemeModule } from "@vetta/theme-sdk";
import { xianxiaAppearance } from "./appearance";
import { XianxiaAppBackground } from "./components/XianxiaAppBackground";
import { XianxiaInputBarBackground } from "./components/XianxiaInputBarBackground";
import "./styles.css";

export const xianxiaTheme: ThemeModule = {
	meta: {
		id: "xianxia",
		name: "Xianxia",
		sdkVersion: "0.1.0",
		version: "0.1.0",
	},
	appearance: xianxiaAppearance,
	components: {
		"app.background": XianxiaAppBackground,
		"chat.inputBarBackground": XianxiaInputBarBackground,
	},
};

export default xianxiaTheme;
