import type { SubscriptionWindow } from "@preload/api.js";

export const WINDOW_LABELS: Record<SubscriptionWindow["kind"], string> = {
	"5h": "5 小时窗口",
	week: "周窗口",
	month: "月窗口",
};

/** 格式化到期日(到天)。 */
export function formatExpiry(iso?: string): string | null {
	if (!iso) return null;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 距离 resetAt 的倒计时，形如「3小时12分后重置」；已过期则提示即将重置。 */
export function formatResetCountdown(iso: string, now: number): string {
	const target = new Date(iso).getTime();
	if (Number.isNaN(target)) return "";
	const diff = target - now;
	if (diff <= 0) return "即将重置";
	const totalMin = Math.floor(diff / 60000);
	const days = Math.floor(totalMin / 1440);
	const hours = Math.floor((totalMin % 1440) / 60);
	const mins = totalMin % 60;
	if (days > 0) return `${days}天${hours}小时后重置`;
	if (hours > 0) return `${hours}小时${mins}分后重置`;
	return `${mins}分后重置`;
}
