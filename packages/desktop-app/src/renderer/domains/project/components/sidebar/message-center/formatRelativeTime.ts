import { i18n } from "@shared/i18n";

export function formatRelativeTime(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return i18n.t("message:time.justNow");
	if (minutes < 60) return i18n.t("message:time.minutesAgo", { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return i18n.t("message:time.hoursAgo", { count: hours });
	const days = Math.floor(hours / 24);
	return i18n.t("message:time.daysAgo", { count: days });
}
