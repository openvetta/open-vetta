import { useState } from "react";
import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import type { RegisteredActivityTab } from "@shared/store/atoms";

export const DEFAULT_PLUGIN_TAB_ICON = "icon-[mdi--puzzle-outline]";

function TabIcon({ icon, className }: { icon: ReactNode; className?: string }): JSX.Element {
	if (typeof icon === "string") {
		return <span className={cn(icon, "h-4 w-4 shrink-0", className)} />;
	}
	return (
		<span
			className={cn(
				"flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full",
				className,
			)}
		>
			{icon}
		</span>
	);
}

interface PluginTabPickerProps {
	/** 可添加池：所有已注册的插件 tab contribution */
	contributions: RegisteredActivityTab[];
	/** 当前会话 cwd 已 attach 的 contribution key（pluginId:tabId） */
	attachedKeys: string[];
	onAttach: (key: string) => void;
	onDetach: (key: string) => void;
}

/**
 * 活动面板 tab 栏右侧的"+"悬浮按钮：弹出勾选列表统一管理插件 tab 的 attach/remove。
 * 按钮平时隐藏，hover tab 栏（group/activity-tabs）或 popover 打开时显示。
 */
export function PluginTabPicker({
	contributions,
	attachedKeys,
	onAttach,
	onDetach,
}: PluginTabPickerProps): JSX.Element {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					title="添加插件面板"
					className={cn(
						"mb-1 mr-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover/activity-tabs:opacity-100",
						open && "opacity-100",
					)}
				>
					<span className="icon-[mdi--plus] h-4 w-4" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" sideOffset={6} className="w-60 gap-0 p-1.5">
				<div className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">插件面板</div>
				{contributions.map((tab) => {
					const key = `${tab.pluginId}:${tab.tabId}`;
					const attached = attachedKeys.includes(key);
					return (
						<button
							key={key}
							type="button"
							onClick={() => (attached ? onDetach(key) : onAttach(key))}
							className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
						>
							<TabIcon icon={tab.icon ?? DEFAULT_PLUGIN_TAB_ICON} className="text-muted-foreground" />
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-[13px] leading-tight text-foreground">{tab.label}</span>
								<span className="truncate text-[11px] leading-tight text-muted-foreground">
									{tab.pluginName}
								</span>
							</span>
							<span
								className={cn("icon-[mdi--check] h-4 w-4 shrink-0 text-primary", !attached && "invisible")}
							/>
						</button>
					);
				})}
			</PopoverContent>
		</Popover>
	);
}
