import { definePlugin } from "@vetta-org/plugin-sdk";
import type { ReactNode } from "react";
import "./style.css";
import { setWorkbenchRuntime } from "./runtime";
import { WorkbenchPanel } from "./WorkbenchPanel";

function WrenchIcon({ className }: { className?: string }): ReactNode {
	return (
		<svg className={className} viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
			<path
				fill="currentColor"
				d="M22.7 19.3 13.6 10.2a6 6 0 0 0-7.8-7.8l3.1 3.1-2.1 2.1-3.1-3.1A6 6 0 0 0 10.2 13.6l9.1 9.1a1 1 0 0 0 1.4 0l2-2a1 1 0 0 0 0-1.4Z"
			/>
		</svg>
	);
}

export default definePlugin({
	activate(ctx) {
		setWorkbenchRuntime(ctx.command, ctx.fs);

		ctx.ui.registerActivityTab({
			id: "workbench",
			label: "%tab.label%",
			icon: <WrenchIcon className="h-4 w-4" />,
			component: WorkbenchPanel,
			scope_use: ["project", "conversation"],
		});

		ctx.ui.registerInputAction({
			id: "mode",
			label: "%action.mode.label%",
			icon: <WrenchIcon className="h-3.5 w-3.5" />,
			defaultActive: false,
			hardIsolation: true,
			scope_use: ["project", "conversation"],
			decoratePrompt: () => ({
				metadata: {
					pluginModes: { "plugin-workbench": true },
				},
			}),
		});
	},
});
