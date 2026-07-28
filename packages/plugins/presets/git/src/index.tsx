import { definePlugin } from "@vetta-org/plugin-sdk";
import "./style.css";
import { GitPanel } from "./components/GitPanel";
import { GitTurnCard } from "./components/GitTurnCard";
import { GitIcon } from "./components/icons";
import { emitRefreshSignal, emitTurnPhase, setGitCommand, setPanelResizer } from "./git/runtime";

export default definePlugin({
	activate(ctx) {
		// Stash the command API for panels (zero-prop activity-tab components read it
		// via the globalThis runtime holder).
		setGitCommand(ctx.command);

		// Let panels resize their host activity panel (narrow click → max, close → narrow).
		setPanelResizer((width) => ctx.ui.openActivityTab("changes", width === undefined ? undefined : { width }));

		// Refresh the panel after each agent turn (it may have edited files), and
		// surface turn start/end phases for the turn card's per-turn baseline diff.
		ctx.conversation.on((event) => {
			if (event.type === "turn-start") {
				emitTurnPhase("start");
			} else if (event.type === "turn-end") {
				emitTurnPhase("end");
				emitRefreshSignal();
			}
		});

		ctx.ui.registerActivityTab({
			id: "changes",
			label: "%tab.label%",
			icon: <GitIcon className="h-4 w-4" />,
			component: GitPanel,
			// 仅在普通项目对话里出现。
			scope_use: ["project"],
		});

		// 消息列表底部的 turn 卡：仅当目录是 Git 仓库且有变更时自显示。
		ctx.ui.registerTurnCard({
			id: "changes",
			component: GitTurnCard,
			scope_use: ["project"],
		});
	},
});
