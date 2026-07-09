import type { ThemeModule } from "@vetta/theme-sdk";
import { xianxiaAppearance } from "./appearance";
import { XianxiaAppBackground } from "./components/XianxiaAppBackground";
import { XianxiaGuidingWords } from "./components/XianxiaGuidingWords";
import { XianxiaInputBarBackground } from "./components/XianxiaInputBarBackground";
import { XianxiaNewSessionBackground } from "./components/XianxiaNewSessionBackground";
import { XianxiaSceneCarousel, XianxiaSkillBadgeRow } from "./components/XianxiaNewSession";
import { XianxiaArtifactLibraryPage } from "./components/artifact-library";
import { XianxiaSanctumPage } from "./components/sanctum-page";
import { XianxiaSidebarNavigation } from "./components/XianxiaSidebarNavigation";
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
		"chat.newSessionBackground": XianxiaNewSessionBackground,
		"chat.newSessionGuidingWords": XianxiaGuidingWords,
		"chat.newSessionSceneCarousel": XianxiaSceneCarousel,
		"chat.newSessionSkillBadgeRow": XianxiaSkillBadgeRow,
		"sidebar.navigation": XianxiaSidebarNavigation,
	},
	pages: [
		{
			id: "artifact-library",
			title: {
				"zh-CN": "法宝库",
				"en-US": "Artifact Library",
			},
			layout: "content",
			nav: {
				icon: "icon-[solar--magic-stick-3-linear]",
				order: 9,
			},
			component: XianxiaArtifactLibraryPage,
		},
		{
			id: "sanctum",
			title: {
				"zh-CN": "洞天",
				"en-US": "Sanctum",
			},
			layout: "app",
			nav: {
				icon: "icon-[solar--stars-linear]",
				order: 10,
			},
			component: XianxiaSanctumPage,
		},
	],
};

export default xianxiaTheme;
