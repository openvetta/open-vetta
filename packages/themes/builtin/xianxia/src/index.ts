import type { ThemeModule } from "@vetta/theme-sdk";
import { xianxiaAppearance } from "./appearance";
import { XianxiaAppBackground } from "./components/XianxiaAppBackground";
import { XianxiaGuidingWords } from "./components/XianxiaGuidingWords";
import { XianxiaInputBarBackground } from "./components/XianxiaInputBarBackground";
import { XianxiaSceneCarousel, XianxiaSkillBadgeRow } from "./components/XianxiaNewSession";
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
		"chat.newSessionGuidingWords": XianxiaGuidingWords,
		"chat.newSessionSceneCarousel": XianxiaSceneCarousel,
		"chat.newSessionSkillBadgeRow": XianxiaSkillBadgeRow,
	},
};

export default xianxiaTheme;
