import { definePlugin } from "@vetta/plugin-sdk";
import "./style.css";
import { GitPanel } from "./components/GitPanel";
import { GitIcon } from "./components/icons";
import { emitRefreshSignal, setGitCommand, setPanelResizer } from "./git/runtime";

export default definePlugin({
	activate(ctx) {
		// Stash the command API for panels (zero-prop activity-tab components read it
		// via the globalThis runtime holder).
		setGitCommand(ctx.command);

		// Let panels resize their host activity panel (narrow click → max, close → narrow).
		setPanelResizer((width) => ctx.ui.openActivityTab("changes", width === undefined ? undefined : { width }));

		// Refresh the panel after each agent turn (it may have edited files).
		ctx.conversation.on((event) => {
			if (event.type === "turn-end") emitRefreshSignal();
		});

		ctx.ui.registerActivityTab({
			id: "changes",
			label: "%tab.label%",
			icon: <GitIcon className="h-4 w-4" />,
			component: GitPanel,
			// 仅在普通项目对话里出现。
			scope_use: ["project"],
		});
	},
});
