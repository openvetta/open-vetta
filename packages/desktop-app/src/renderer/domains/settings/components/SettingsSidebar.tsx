import { cn } from "@shared/lib/utils";
import type { SettingsPageModel } from "./types";

export interface SettingsSidebarProps {
	model: SettingsPageModel;
}

export function SettingsSidebar({ model }: SettingsSidebarProps): JSX.Element {
	return (
		<div className={cn("flex shrink-0 flex-col", model.narrow ? "w-14" : "w-[200px]")}>
			<div className={cn("drag-region", model.narrow ? "h-12" : "px-5 pb-2 pt-2")}>
				{!model.narrow && (
					<h1 className="text-[20px] font-bold text-foreground">{model.title}</h1>
				)}
			</div>
			<nav className={cn("flex flex-col gap-0.5", model.narrow ? "px-2" : "px-2.5")}>
				{model.tabs.map((item) => (
					<button
						key={item.key}
						type="button"
						title={item.title}
						onClick={() => model.onSelectTab(item.key)}
						className={cn(
							"flex items-center rounded-lg text-[13px] font-medium transition-colors",
							model.narrow ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-[7px]",
							model.activeTab === item.key
								? "bg-accent text-foreground"
								: "text-foreground hover:bg-accent/50",
						)}
					>
						<span className={cn(item.icon, "h-4 w-4 shrink-0")} />
						{!model.narrow && <span className="flex-1 text-left">{item.label}</span>}
						{!model.narrow && item.beta && (
							<span className="rounded-full bg-primary/15 px-1.5 py-px text-[9px] font-semibold uppercase text-primary">
								{model.betaBadgeLabel}
							</span>
						)}
					</button>
				))}
			</nav>
		</div>
	);
}
