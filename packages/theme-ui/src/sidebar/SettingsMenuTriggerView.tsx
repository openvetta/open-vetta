import { forwardRef, type ComponentPropsWithoutRef, type JSX, type ReactNode } from "react";
import { cn } from "@vetta/ui";

export interface SettingsMenuTriggerViewProps extends ComponentPropsWithoutRef<"button"> {
	readonly avatar?: ReactNode;
	/** 工作模式 badge 文案（Work/Coding，见 ADR-0046）。展示位取代原 Go 套餐 badge。 */
	readonly agentModeBadge?: string;
	readonly agentModeTitle?: string;
	readonly open: boolean;
	readonly settingsFallbackLabel: string;
	readonly userLabel?: string | null;
}

function AgentModeBadge({ label, title }: { label: string; title?: string }): JSX.Element {
	return (
		<span
			className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-medium leading-none text-foreground"
			title={title || label}
		>
			{label}
		</span>
	);
}

export const SettingsMenuTriggerView = forwardRef<HTMLButtonElement, SettingsMenuTriggerViewProps>(
	function SettingsMenuTriggerView(
		{ avatar, className, agentModeBadge, agentModeTitle, open, settingsFallbackLabel, userLabel, ...props },
		ref,
	): JSX.Element {
		return (
			<button
				ref={ref}
				type="button"
				className={cn(
					"no-drag flex w-full items-center gap-2 rounded-lg px-2.5 py-[6px] text-[12px] font-medium transition-colors",
					open ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
					className,
				)}
				{...props}
			>
				{userLabel ? (
					<>
						{avatar}
						<span className="truncate">{userLabel}</span>
						{agentModeBadge && <AgentModeBadge label={agentModeBadge} title={agentModeTitle} />}
					</>
				) : (
					<>
						<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
						<span className="truncate">{settingsFallbackLabel}</span>
						{agentModeBadge && <AgentModeBadge label={agentModeBadge} title={agentModeTitle} />}
					</>
				)}
			</button>
		);
	},
);
