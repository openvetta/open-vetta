import { useAtom, useAtomValue } from "jotai";
import { useCallback } from "react";
import { activeInputActionIdsAtom, pluginInputActionsAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";

/**
 * Plugin input-action toggles, shown in a row beneath the AI input bar.
 * Clicking activates an action; clicking again deactivates. Active ids are
 * tracked in activeInputActionIdsAtom and consumed at send time (decoratePrompt
 * → PromptRequest.metadata). Distinct from ActionButtonBar (one-shot pills).
 */
export function InputActionBar(): JSX.Element | null {
	const actions = useAtomValue(pluginInputActionsAtom);
	const [activeIds, setActiveIds] = useAtom(activeInputActionIdsAtom);

	const toggle = useCallback(
		(actionId: string, onToggle: ((active: boolean) => void) | undefined) => {
			setActiveIds((prev) => {
				const next = new Set(prev);
				const active = !next.has(actionId);
				if (active) next.add(actionId);
				else next.delete(actionId);
				onToggle?.(active);
				return next;
			});
		},
		[setActiveIds],
	);

	if (actions.length === 0) return null;

	return (
		<div className="mb-1.5 flex flex-wrap gap-1.5 px-1">
			{actions.map((action) => {
				const active = activeIds.has(action.actionId);
				return (
					<button
						key={action.actionId}
						type="button"
						onClick={() => toggle(action.actionId, action.onToggle)}
						className={cn(
							"flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
							active
								? "border-primary/30 bg-primary/15 text-primary"
								: "border-border/60 bg-transparent text-muted-foreground hover:bg-muted/50",
						)}
					>
						{action.icon && <span className="flex h-3.5 w-3.5 items-center justify-center">{action.icon}</span>}
						<span>{action.label}</span>
					</button>
				);
			})}
		</div>
	);
}
