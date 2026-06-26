import { activeSessionAtom, isStreamingAtom, sessionExecutionModeAtom, type SessionExecutionMode } from "@shared/store/atoms";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import { useAtom, useAtomValue } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// label/title 由组件内 t() 在渲染期解析（模块级常量无法用 hook）。
const MODE_OPTIONS: Array<{
	mode: SessionExecutionMode;
	icon: string;
}> = [
	{ mode: "sandbox", icon: "icon-[solar--shield-linear]" },
	{ mode: "full-access", icon: "icon-[solar--shield-cross-linear]" },
];

const itemVariants = {
	hidden: { opacity: 0, x: -12 },
	show: { opacity: 1, x: 0 },
};

export function ExecutionModeSelector(): JSX.Element {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const isStreaming = useAtomValue(isStreamingAtom);
	const [mode, setMode] = useAtom(sessionExecutionModeAtom);
	const [open, setOpen] = useState(false);
	const [isSwitching, setIsSwitching] = useState(false);
	const [sandboxUnavailableReason, setSandboxUnavailableReason] = useState<string | null>(null);
	// 没有 activeSession 也允许切换：此时只更新本地 atom + localStorage，
	// 新会话创建时会读取该值传给 session.create。
	const disabled = isStreaming || isSwitching;

	useEffect(() => {
		void window.vetta.config.get().then((config) => {
			const capability = config.sandbox ?? config.linuxSandbox;
			if (capability?.status === "unavailable") {
				const reason = capability.reason ?? "unknown_error";
				const platform = "platform" in capability ? capability.platform : "linux";
				setSandboxUnavailableReason(`${platform} 沙盒不可用：${reason}`);
				return;
			}
			setSandboxUnavailableReason(null);
		});
	}, []);

	const labelFor = useCallback(
		(m: SessionExecutionMode): string =>
			m === "sandbox" ? t("executionModeSelector.sandbox.label") : t("executionModeSelector.fullAccess.label"),
		[t],
	);
	const titleFor = useCallback(
		(m: SessionExecutionMode): string =>
			m === "sandbox" ? t("executionModeSelector.sandbox.title") : t("executionModeSelector.fullAccess.title"),
		[t],
	);

	const modeOptions = useMemo(
		() =>
			MODE_OPTIONS.map((option) => ({
				...option,
				label: labelFor(option.mode),
				title:
					option.mode === "sandbox" && sandboxUnavailableReason ? sandboxUnavailableReason : titleFor(option.mode),
				disabled: option.mode === "sandbox" && !!sandboxUnavailableReason,
			})),
		[sandboxUnavailableReason, labelFor, titleFor],
	);

	const selectedOption = modeOptions.find((option) => option.mode === mode) ?? modeOptions[0];

	const handleSelect = useCallback(
		async (nextMode: SessionExecutionMode) => {
			if (disabled || nextMode === mode) return;
			if (nextMode === "sandbox" && sandboxUnavailableReason) return;
			const previousMode = mode;
			setMode(nextMode);
			localStorage.setItem("vetta-session-execution-mode", nextMode);
			// 没有 activeSession（如 NewSessionPage）时只更新本地状态，
			// 不发 IPC——会话尚未创建。
			if (!activeSession) return;
			setIsSwitching(true);
			try {
				await window.vetta.session.setExecutionMode(activeSession.runtimeId, nextMode);
			} catch (error) {
				setMode(previousMode);
				localStorage.setItem("vetta-session-execution-mode", previousMode);
				console.error("[ExecutionModeSelector] failed to switch execution mode:", error);
			} finally {
				setIsSwitching(false);
			}
		},
		[activeSession, disabled, mode, sandboxUnavailableReason, setMode],
	);

	return (
		<div className="ml-1 min-w-0">
			<Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						disabled={disabled}
						title={selectedOption.title}
						className={cn(
							"no-drag flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-lg px-2 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40",
							open
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
						)}
					>
						<span className={cn(selectedOption.icon, "h-3.5 w-3.5 shrink-0")} />
						<span className="truncate">{selectedOption.label}</span>
					</button>
				</PopoverTrigger>
				<AnimatePresence>
					{open && (
						<PopoverContent
							forceMount
							asChild
							side="top"
							align="start"
							sideOffset={6}
							className="w-[148px] gap-0 overflow-hidden rounded-lg border border-border p-1"
							style={{ animation: "none" }}
						>
							<motion.div
								initial={{ opacity: 0, scale: 0.96, y: 8 }}
								animate={{ opacity: 1, scale: 1, y: 0 }}
								exit={{ opacity: 0, scale: 0.96, y: 8 }}
								transition={{ duration: 0.1, ease: [0.16, 1, 0.3, 1] }}
							>
								<motion.div
									variants={{
										hidden: {},
										show: { transition: { staggerChildren: 0.025, delayChildren: 0.02 } },
									}}
									initial="hidden"
									animate="show"
								>
									{modeOptions.map((option) => (
										<motion.div key={option.mode} variants={itemVariants}>
											<button
												type="button"
												title={option.title}
												disabled={option.disabled}
												onClick={() => {
													setOpen(false);
													void handleSelect(option.mode);
												}}
												className={cn(
													"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
													mode === option.mode
														? "bg-accent text-foreground"
														: "text-foreground hover:bg-accent",
												)}
											>
												<span className={cn(option.icon, "h-3.5 w-3.5 shrink-0")} />
												<span className="truncate">{option.label}</span>
												{mode === option.mode && (
													<span className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 text-primary" />
												)}
											</button>
										</motion.div>
									))}
								</motion.div>
							</motion.div>
						</PopoverContent>
					)}
				</AnimatePresence>
			</Popover>
		</div>
	);
}
