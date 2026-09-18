import type { PluginContext } from "@vetta-org/plugin-sdk";
import type { JSX } from "react";

export function BoardView({ ctx }: { ctx: PluginContext }): JSX.Element {
	return (
		<div className="flex h-full w-full flex-col bg-background p-6">
			<h1 className="text-lg font-semibold text-foreground">{ctx.i18n.t("board.title")}</h1>
		</div>
	);
}
