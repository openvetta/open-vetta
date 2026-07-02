import { useTranslation } from "react-i18next";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";

export function MessageCenterTrigger({
	open,
	totalUnread,
	onOpen,
}: {
	open: boolean;
	totalUnread: number;
	onOpen: () => void;
}): JSX.Element {
	const { t } = useTranslation("message");

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			onClick={onOpen}
			className={cn("no-drag relative", open && "bg-accent text-foreground")}
			title={t("triggerTitle")}
		>
			<span
				className={cn("inline-flex h-4 w-4 items-center justify-center", totalUnread > 0 && "message-bell-swing")}
			>
				<span className="icon-[solar--bell-linear] h-4 w-4" />
			</span>
			{totalUnread > 0 && (
				<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground shadow-sm">
					{totalUnread}
				</span>
			)}
		</Button>
	);
}
