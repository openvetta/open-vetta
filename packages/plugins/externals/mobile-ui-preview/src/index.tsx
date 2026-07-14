import { definePlugin } from "@vetta-org/plugin-sdk";
import { MobilePreviewPanel } from "./MobilePreviewPanel";
import { setPluginCtx } from "./plugin-context";
import "./style.css";

export default definePlugin({
	activate(ctx) {
		setPluginCtx(ctx);
		// 注意：MF 插件的共享依赖（含 jsx runtime）是异步填充的，模块顶层
		// 不能出现 JSX；icon 须在 activate 内构造（此时 bootstrap 已完成）。
		ctx.ui.registerActivityTab({
			id: "preview",
			label: "移动预览",
			icon: (
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
					<rect x="7" y="2.5" width="10" height="19" rx="2.5" />
					<path d="M10.5 18.5h3" strokeLinecap="round" />
				</svg>
			),
			component: MobilePreviewPanel,
			// 仅交互式对话场景出现。
			scope_use: ["conversation", "project", "cli"],
		});
	},
});
