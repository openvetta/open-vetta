import { definePlugin } from "@vetta-org/plugin-sdk";
import "./style.css";
import { OpenInApp, setHostApis } from "./OpenInApp";

export default definePlugin({
	activate(ctx) {
		setHostApis(ctx.command, ctx.ui.notify);
		ctx.ui.registerHeaderAction({
			id: "open-in-app",
			// 排最前：内置按钮组左边的第一格，之后别的插件按自己的 order 往左排。
			order: 100,
			component: OpenInApp,
		});
	},
	deactivate() {
		setHostApis(undefined, undefined);
	},
});
