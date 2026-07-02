import { useTranslation } from "react-i18next";
import { isMac } from "@shared/lib/platform";
import { cn } from "@shared/lib/utils";
import { SidebarUpdateButton } from "./update/SidebarUpdateButton";

interface SidebarTopBarProps {
	floating: boolean;
	imOnline: boolean;
	onCollapse?: () => void;
	onOpenClawSettings: () => void;
}

export function SidebarTopBar({
	floating,
	imOnline,
	onCollapse,
	onOpenClawSettings,
}: SidebarTopBarProps): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<div
			className={cn(
				"flex h-11 shrink-0 items-center justify-between",
				!floating && "drag-region",
			)}
			style={{ paddingLeft: isMac ? 78 : 12, paddingRight: 6 }}
		>
			{isMac ? (
				<div className="flex min-w-0 items-center">
					<SidebarUpdateButton />
				</div>
			) : (
				<div className="flex min-w-0 items-center gap-2">
					<img
						src="./icon.png"
						alt="Vetta"
						className="h-5 w-5 shrink-0 rounded-[5px]"
					/>
					<span className="truncate text-[13px] font-semibold text-foreground">Vetta</span>
					<SidebarUpdateButton />
				</div>
			)}
			<div className="flex items-center gap-1">
				{imOnline && (
					<button
						type="button"
						onClick={onOpenClawSettings}
						title={t("sidebar.clawConnected")}
						className="no-drag relative flex h-5 items-center gap-1 rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary transition-colors hover:bg-primary/25"
					>
						<span className="relative flex h-1 w-1">
							<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
							<span className="relative inline-flex h-1 w-1 rounded-full bg-primary" />
						</span>
						Claw
					</button>
				)}
				{onCollapse && (
					<button
						type="button"
						onClick={onCollapse}
						title={t("sidebar.hide")}
						className="no-drag flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
					>
						<span className="icon-[solar--sidebar-minimalistic-linear] h-4 w-4" />
					</button>
				)}
			</div>
		</div>
	);
}
