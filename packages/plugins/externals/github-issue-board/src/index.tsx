import { definePlugin } from "@vetta-org/plugin-sdk";
import type { JSX } from "react";
import { BoardView } from "./BoardView";
import "./style.css";

/**
 * GitHub Issue 任务台：跨会话的整页工作台。
 *
 * 本包只打通「插件构建 → manifest 权限 → 宿主整页 UI」这条竖线。
 * 队列、拉取、执行由后续 ticket 填入。没有模块级运行态，也不提供
 * `deactivate()`——注册的贡献由宿主统一处置。
 */
export default definePlugin({
	activate(ctx) {
		ctx.ui.registerWorkspaceView({
			id: "board",
			label: "%view.board.label%",
			icon: "icon-[solar--checklist-linear]",
			description: "%view.board.description%",
			component: function GithubIssueBoardView(): JSX.Element {
				return <BoardView ctx={ctx} />;
			},
		});
	},
});
