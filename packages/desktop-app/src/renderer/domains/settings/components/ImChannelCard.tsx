import { useTranslation } from "react-i18next";
import type { ImTransportStatus } from "@preload/api";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { ImStatusBadge } from "./ImStatusBadge";

export function ImChannelCard({
	name,
	subtitle,
	iconClass,
	configured,
	isActive,
	transportStatus,
	actionLabel,
	onAction,
	onActivate,
}: {
	name: string;
	subtitle: string;
	iconClass: string;
	configured: boolean;
	isActive: boolean;
	transportStatus: ImTransportStatus;
	actionLabel: string;
	onAction: () => void;
	onActivate?: () => void;
}): JSX.Element {
	const { t } = useTranslation("settings");
	const effectiveStatus: ImTransportStatus = isActive ? transportStatus : "offline";

	return (
		<div
			className={cn(
				"flex flex-col gap-4 rounded-2xl border bg-muted p-5",
				isActive ? "border-primary/60" : "border-border",
			)}
		>
			<div className="flex items-start gap-3">
				<span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-background">
					<span className={cn(iconClass, "h-6 w-6")} />
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<div className="text-[15px] font-semibold text-foreground">{name}</div>
						{isActive && (
							<span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
								{t("channelActive")}
							</span>
						)}
					</div>
					<div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
				</div>
				{configured ? (
					<ImStatusBadge status={effectiveStatus} />
				) : (
					<span className="inline-flex items-center rounded-full bg-muted-foreground/15 px-2 py-0.5 text-[11px] text-muted-foreground">
						{t("channelNotAssociated")}
					</span>
				)}
			</div>

			<div className="flex gap-2">
				{configured && onActivate && (
					<Button variant="outline" onClick={onActivate} title={t("activateChannelTitle")}>
						<span className="icon-[mdi--swap-horizontal] h-4 w-4" />
						{t("activateChannel")}
					</Button>
				)}
				<Button variant="outline" onClick={onAction} className="flex-1">
					<span className="icon-[mdi--cog-outline] h-4 w-4" />
					{actionLabel}
				</Button>
			</div>
		</div>
	);
}
