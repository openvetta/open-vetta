import { useTranslation } from "react-i18next";
import type { ImTransportStatus } from "@preload/api";
import { cn } from "@shared/lib/utils";

const STATUS_LABEL: Record<ImTransportStatus, string> = {
	offline: "imbStatusOffline",
	connecting: "imbStatusConnecting",
	online: "imbStatusOnline",
	error: "imbStatusError",
	awaiting_bind: "imbStatusAwaitingBind",
};

const STATUS_CLASS: Record<ImTransportStatus, string> = {
	offline: "bg-muted text-muted-foreground",
	connecting: "bg-amber-500/15 text-amber-400",
	online: "bg-emerald-500/15 text-emerald-400",
	error: "bg-destructive/15 text-destructive",
	awaiting_bind: "bg-primary/10 text-primary",
};

export function ImStatusBadge({ status }: { status: ImTransportStatus }): JSX.Element {
	const { t } = useTranslation("settings");
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
				STATUS_CLASS[status],
			)}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-current" />
			{t(STATUS_LABEL[status] as any)}
		</span>
	);
}
