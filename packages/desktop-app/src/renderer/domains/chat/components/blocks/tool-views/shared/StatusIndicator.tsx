import type { ToolCallBlock } from "@shared/store/atoms";
import { toolIcon } from "./parse-tool";

/** Status indicator dot/icon */
export function StatusIndicator({ status }: { status: ToolCallBlock["status"] }): JSX.Element {
	if (status === "pending") {
		return (
			<span
				className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40"
				style={{ animation: "pulse 1.5s infinite" }}
			/>
		);
	}
	if (status === "error") {
		return <span className="icon-[mdi--close-circle-outline] h-3.5 w-3.5 shrink-0 text-destructive/70" />;
	}
	return <span className={`${toolIcon("success")} h-3.5 w-3.5 shrink-0 text-muted-foreground/30`} />;
}
