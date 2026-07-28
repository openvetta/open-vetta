import { fetchUsageSeries, type UsageSeriesPoint } from "@shared/lib/api";
import { authTokenAtom } from "@shared/store/auth-atoms";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TokenActivityChartViewProps } from "./TokenActivityChartView";

export type TokenActivityChartModel = TokenActivityChartViewProps | null;

export function useTokenActivityChartModel(): TokenActivityChartModel {
	const { t, i18n } = useTranslation("settings");
	const token = useAtomValue(authTokenAtom);
	const [points, setPoints] = useState<UsageSeriesPoint[]>([]);
	const [loading, setLoading] = useState(false);

	const load = useCallback(async () => {
		if (!token) {
			setPoints([]);
			return;
		}
		setLoading(true);
		try {
			const series = await fetchUsageSeries(token, 365);
			setPoints(series.points ?? []);
		} catch {
			setPoints([]);
		} finally {
			setLoading(false);
		}
	}, [token]);

	useEffect(() => {
		void load();
	}, [load]);

	const labels = useMemo(
		() => ({
			title: t("tokenActivity.title"),
			daily: t("tokenActivity.daily"),
			weekly: t("tokenActivity.weekly"),
			cumulative: t("tokenActivity.cumulative"),
			empty: t("tokenActivity.empty"),
			tokens: (count: string) => t("tokenActivity.tokens", { count }),
			month: (yearMonth: string) => {
				const [y, m] = yearMonth.split("-").map(Number);
				if (!y || !m) return yearMonth;
				const d = new Date(y, m - 1, 1);
				return d.toLocaleString(i18n.language.startsWith("zh") ? "zh-CN" : "en", {
					month: "short",
				});
			},
		}),
		[t, i18n.language],
	);

	if (!token) return null;
	return { points, loading, labels };
}
