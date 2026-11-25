import { forwardRef, type ComponentPropsWithoutRef, type JSX } from "react";
import { ButtonGroup, ButtonGroupItem } from "@vetta-org/ui/button-group";
import { chromeButtonGroupVariant } from "../shared/platform";
import { cn } from "@vetta-org/ui/utils";

export interface SettingsMenuTriggerViewProps extends ComponentPropsWithoutRef<"button"> {
	/** Claw 在线状态徽章，仅在线时展示。 */
	readonly clawOnline?: boolean;
	readonly clawTitle?: string;
	/** 当前是否停在设置页，用于按钮组的高亮状态。 */
	readonly active?: boolean;
	readonly iconOnly?: boolean;
	readonly settingsFallbackLabel: string;
}

/** 底部工作空间切换同款按钮组里的一个 item，点击后直接进入设置页。 */
export const SettingsMenuTriggerView = forwardRef<HTMLButtonElement, SettingsMenuTriggerViewProps>(
	function SettingsMenuTriggerView(
		{ className, clawOnline, clawTitle, active, iconOnly, settingsFallbackLabel, ...props },
		ref,
	): JSX.Element {
		const label = clawOnline && clawTitle ? `${settingsFallbackLabel} · ${clawTitle}` : settingsFallbackLabel;

		return (
			<ButtonGroup blur={false} variant={chromeButtonGroupVariant} className="no-drag shrink-0">
				<ButtonGroupItem
					ref={ref}
					active={Boolean(active)}
					aria-label={label}
					title={label}
					icon={<span aria-hidden="true" className="icon-[solar--settings-minimalistic-linear] size-4 shrink-0" />}
					label={iconOnly ? undefined : settingsFallbackLabel}
					badge={
						clawOnline ? (
							<span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />
						) : undefined
					}
					className={cn(!iconOnly && "w-full justify-start", className)}
					{...props}
				/>
			</ButtonGroup>
		);
	},
);
