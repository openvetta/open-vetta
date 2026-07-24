import { AGENT_MODES, AGENT_MODE_ICONS } from "@shared/components/AgentModeSwitcher";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@shared/components/ui/dropdown-menu";
import { useAgentMode } from "@shared/hooks/useAgentMode";
import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * 侧边栏顶栏工作模式徽章：点击展开下拉菜单切换 Work/Coding。
 * 取代原 Claw 徽章的顶部展示位（Claw 已下沉到底部头像 item）。
 * `compact`：窄侧栏时隐藏文案与箭头，仅保留模式 icon，避免顶栏挤叠错位。
 */
export function AgentModeBadgeDropdown({
	className,
	compact = false,
}: {
	className?: string;
	compact?: boolean;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const { agentMode, setAgentMode } = useAgentMode();
	const modeLabel = t(`agentMode.${agentMode}`);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					data-compact={compact ? "true" : undefined}
					title={compact ? modeLabel : t("agentMode.title")}
					aria-label={t("agentMode.title")}
					className={cn(
						"no-drag flex h-5 shrink-0 items-center justify-center font-medium text-foreground transition-colors hover:bg-accent/80",
						compact
							? "w-5 rounded-md bg-accent"
							: "gap-1 rounded-full bg-accent px-2 text-[10px]",
						className,
					)}
				>
					<span className={cn(AGENT_MODE_ICONS[agentMode], "h-3 w-3 shrink-0")} aria-hidden />
					{!compact && (
						<>
							<span className="min-w-0 truncate">{modeLabel}</span>
							<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0 opacity-70" aria-hidden />
						</>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-36">
				{AGENT_MODES.map((mode) => {
					const active = mode === agentMode;
					return (
						<DropdownMenuItem key={mode} onSelect={() => void setAgentMode(mode)} className="gap-2 text-[12px]">
							<span className={cn(AGENT_MODE_ICONS[mode], "h-4 w-4 shrink-0")} />
							<span className="flex-1">{t(`agentMode.${mode}`)}</span>
							{active && <span className="icon-[solar--check-circle-bold] h-4 w-4 shrink-0 text-primary" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

