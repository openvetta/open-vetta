import { activeSessionAtom, isStreamingAtom, sessionExecutionModeAtom, type SessionExecutionMode } from "@shared/store/atoms";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shared/components/ui/select";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useState } from "react";

const MODE_OPTIONS: Array<{
	mode: SessionExecutionMode;
	label: string;
	title: string;
	icon: string;
}> = [
	{
		mode: "sandbox",
		label: "沙盒受限",
		title: "仅允许工作区受限访问",
		icon: "icon-[mdi--shield-outline]",
	},
	{
		mode: "full-access",
		label: "完全访问",
		title: "允许完全访问当前系统",
		icon: "icon-[mdi--shield-off-outline]",
	},
];

export function ExecutionModeSelector(): JSX.Element {
	const activeSession = useAtomValue(activeSessionAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [mode, setMode] = useAtom(sessionExecutionModeAtom);
	const [isSwitching, setIsSwitching] = useState(false);
	const disabled = !activeSession || isStreaming || isSwitching;

	const handleSelect = useCallback(
		async (nextMode: SessionExecutionMode) => {
			if (!activeSession || disabled || nextMode === mode) return;
			const previousMode = mode;
			setMode(nextMode);
			setIsSwitching(true);
			try {
				await window.vetta.session.setExecutionMode(activeSession.runtimeId, nextMode);
			} catch (error) {
				setMode(previousMode);
				console.error("[ExecutionModeSelector] failed to switch execution mode:", error);
			} finally {
				setIsSwitching(false);
			}
		},
		[activeSession, disabled, mode, setMode],
	);

	return (
		<div className="ml-1">
			<Select value={mode} onValueChange={(value) => void handleSelect(value as SessionExecutionMode)} disabled={disabled}>
				<SelectTrigger
					size="sm"
					className="h-7 border-border/70 bg-background/50 px-2 text-[12px] text-muted-foreground hover:text-foreground"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{MODE_OPTIONS.map((option) => (
						<SelectItem key={option.mode} value={option.mode} title={option.title} className="text-[12px]">
							<span className="inline-flex items-center gap-1.5">
								<span className={`${option.icon} h-3.5 w-3.5`} />
								<span>{option.label}</span>
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
