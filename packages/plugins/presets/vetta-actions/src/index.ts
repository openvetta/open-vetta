import { definePlugin } from "@vetta-org/plugin-sdk";
import { registerAgentActions } from "./domains/agent";
import { registerDownloadsActions } from "./domains/downloads";
import { registerGeneralActions } from "./domains/general";
import { registerUpdaterActions } from "./domains/updater";
import { registerWebhookActions } from "./domains/webhook";

export default definePlugin({
	activate(ctx) {
		registerGeneralActions(ctx);
		registerAgentActions(ctx);
		registerDownloadsActions(ctx);
		registerUpdaterActions(ctx);
		registerWebhookActions(ctx);
	},
});
