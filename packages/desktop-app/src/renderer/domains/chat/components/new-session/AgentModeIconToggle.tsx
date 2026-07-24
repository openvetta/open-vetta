import { AGENT_MODES, AGENT_MODE_ICONS } from "@shared/components/AgentModeSwitcher";
import { useAgentMode } from "@shared/hooks/useAgentMode";
import { cn } from "@shared/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * 新会话欢迎区专用：仅图标的胶囊形工作/编程切换。
 * 不改动共享 AgentModeSwitcher（设置菜单等仍用带文案的分段样式）。
 */
export function AgentModeIconToggle({ className }: { className?: string }): JSX.Element {
	const { t } = useTranslation("settings");
	const { agentMode, setAgentMode } = useAgentMode();
	const activeIndex = Math.max(0, AGENT_MODES.indexOf(agentMode));

	return (
		<div
			role="group"
			aria-label={t("agentMode.title")}
			className={cn(
				"relative inline-flex h-7 shrink-0 items-center rounded-full border border-primary/40 p-0.5",
				className,
			)}
		>
			<div
				aria-hidden
				className="absolute top-0.5 bottom-0.5 rounded-full bg-primary transition-[left] duration-200 ease-out"
				style={{ width: "calc(50% - 2px)", left: activeIndex === 0 ? "2px" : "50%" }}
			/>
			{AGENT_MODES.map((mode) => {
				const active = mode === agentMode;
				return (
					<button
						key={mode}
						type="button"
						onClick={() => void setAgentMode(mode)}
						aria-label={t(`agentMode.${mode}`)}
						aria-pressed={active}
						title={t(`agentMode.${mode}`)}
						className={cn(
							"relative z-10 flex h-6 w-7 items-center justify-center rounded-full transition-colors",
							active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
						)}
					>
						<span className={cn(AGENT_MODE_ICONS[mode], "h-3.5 w-3.5 shrink-0")} />
					</button>
				);
			})}
		</div>
	);
}
