import { definePlugin } from "@vetta-org/plugin-sdk";
import { ExcalidrawPreview } from "./ExcalidrawPreview";
import "./style.css";

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerFilePreview({
			extensions: ["excalidraw"],
			component: ExcalidrawPreview,
		});
	},
});
