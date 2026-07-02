import { i18n } from "@shared/i18n";

export function relativeTime(timestamp: number): string {
	const now = Date.now();
	const diff = now - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) return i18n.t("project:sidebar.time.justNow");
	if (minutes < 60) return i18n.t("project:sidebar.time.minutes", { count: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return i18n.t("project:sidebar.time.hours", { count: hours });
	const days = Math.floor(hours / 24);
	if (days < 7) return i18n.t("project:sidebar.time.days", { count: days });
	const weeks = Math.floor(days / 7);
	if (weeks < 5) return i18n.t("project:sidebar.time.weeks", { count: weeks });
	const months = Math.floor(days / 30);
	if (months < 12) return i18n.t("project:sidebar.time.months", { count: months });
	return i18n.t("project:sidebar.time.years", { count: Math.floor(months / 12) });
}
