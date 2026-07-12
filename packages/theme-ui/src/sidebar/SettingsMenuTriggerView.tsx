import { forwardRef, type ComponentPropsWithoutRef, type JSX, type ReactNode } from "react";
import { cn } from "@vetta/ui";

export interface SettingsMenuTriggerViewProps extends ComponentPropsWithoutRef<"button"> {
	readonly avatar?: ReactNode;
	readonly goBadgeColor?: string;
	readonly goBadgeText?: string | null;
	readonly goEnabled?: boolean;
	readonly goTitle?: string;
	readonly open: boolean;
	readonly settingsFallbackLabel: string;
	readonly userLabel?: string | null;
}

export const SettingsMenuTriggerView = forwardRef<HTMLButtonElement, SettingsMenuTriggerViewProps>(
	function SettingsMenuTriggerView(
		{
			avatar,
			className,
			goBadgeColor,
			goBadgeText,
			goEnabled,
			goTitle,
			open,
			settingsFallbackLabel,
			userLabel,
			...props
		},
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
						{goEnabled && (
							<span
								className="inline-flex shrink-0 items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none text-primary-foreground"
								style={{ backgroundColor: goBadgeColor || "var(--primary)" }}
								title={goTitle || "Vetta Go"}
							>
								{goBadgeText || goTitle || "Go"}
							</span>
						)}
					</>
				) : (
					<>
						<span className="icon-[solar--settings-linear] h-3.5 w-3.5" />
						{settingsFallbackLabel}
					</>
				)}
			</button>
		);
	},
);
