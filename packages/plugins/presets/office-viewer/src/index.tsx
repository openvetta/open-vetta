import { definePlugin } from "@vetta/plugin-sdk";
import { OfficePreview } from "./OfficePreview";
import { OFFICE_EXTENSIONS } from "./office-formats";
import "./style.css";

export default definePlugin({
	activate(ctx) {
		ctx.ui.registerFilePreview({
			extensions: OFFICE_EXTENSIONS,
			component: OfficePreview,
		});
	},
});
