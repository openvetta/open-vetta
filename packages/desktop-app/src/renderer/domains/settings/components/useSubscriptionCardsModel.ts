import type { SubscriptionStatus } from "@preload/api.js";
import { formatExpiry, formatResetCountdown, WINDOW_LABEL_KEYS } from "@shared/lib/subscription-format";
import { remoteProvidersAtom, subscriptionStatusAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { recordSettingsUsage } from "./recordSettingsUsage";

export type ModelCost = { cacheRead: number; cacheWrite: number; input: number; output: number };
export type RemoteModel = {
	api?: string;
	contextWindow?: number;
	id: string;
	input?: string[];
	maxTokens?: number;
	multiplier?: ModelCost;
	name?: string;
	reasoning?: boolean;
	tags?: string[];
};
export type RemoteProvider = { api?: string; baseUrl?: string; icon?: string; models?: RemoteModel[] };

export interface SubscriptionWindowViewModel {
	consumed: number;
	kind: string;
	label: string;
	limit: number;
	resetAt: string;
}

export interface SubscriptionCardsModel {
	actions: {
		refresh: () => Promise<void>;
	};
	expiry: string | null;
	goProvider: RemoteProvider | undefined;
	labels: {
		currentPlan: string;
		expiryDate: (date: string) => string;
		freeModel: string;
		modelMultiplier: (value: string) => string;
		modelsCount: (count: number) => string;
		refresh: string;
		refreshing: string;
		thinking: string;
		tokenPlan: string;
		unlimitedQuota: string;
		updated: string;
		vision: string;
	};
	now: number;
	refreshing: boolean;
	showGoCard: boolean;
	status: SubscriptionStatus;
	windows: SubscriptionWindowViewModel[];
}

export function formatMultiplier(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

export function formatWindowReset(resetAt: string, now: number): string {
	return formatResetCountdown(resetAt, now);
}

export function useSubscriptionCardsModel(): SubscriptionCardsModel {
	const { t } = useTranslation("settings");
	const [remoteProviders, setRemoteProviders] = useAtom(remoteProvidersAtom);
	const [subscriptionStatus, setSubscriptionStatus] = useAtom(subscriptionStatusAtom);
	const [refreshing, setRefreshing] = useState(false);
	const [now, setNow] = useState(() => Date.now());

	const handleRefreshRemote = useCallback(async () => {
		setRefreshing(true);
		try {
			const [result, sub] = await Promise.all([
				window.vetta.models.fetchRemote(),
				window.vetta.subscription.getStatus(),
			]);
			setRemoteProviders(result.providers);
			if (sub.status) setSubscriptionStatus(sub.status);
			recordSettingsUsage({ tab: "subscription", action: "refreshed", target: "status" });
		} catch {
			// 刷新失败时保留现有展示。
		} finally {
			setRefreshing(false);
		}
	}, [setRemoteProviders, setSubscriptionStatus]);

	useEffect(() => {
		void window.vetta.subscription
			.getStatus()
			.then((sub) => {
				if (sub.status) setSubscriptionStatus(sub.status);
			})
			.catch(() => {});
	}, [setSubscriptionStatus]);

	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 60000);
		return () => clearInterval(timer);
	}, []);

	const remoteEntries = Object.entries(remoteProviders as Record<string, RemoteProvider>);
	const goProvider = remoteEntries.find(([name]) => name === "vetta-go")?.[1];
	const showGoCard = subscriptionStatus.active && subscriptionStatus.go_enabled;

	const labels = useMemo(
		() => ({
			currentPlan: t("subCurrentPlan"),
			expiryDate: (date: string) => t("expiryDate", { date }),
			freeModel: t("freeModel"),
			modelMultiplier: (value: string) => t("modelMultiplier", { value }),
			modelsCount: (count: number) => t("modelsCount", { count }),
			refresh: t("refresh"),
			refreshing: t("refreshing"),
			thinking: t("thinking"),
			tokenPlan: t("tokenPlan"),
			unlimitedQuota: t("unlimitedQuota"),
			updated: t("updated"),
			vision: t("vision"),
		}),
		[t],
	);

	const windows = useMemo<SubscriptionWindowViewModel[]>(
		() =>
			(subscriptionStatus.windows ?? []).map((windowInfo) => ({
				consumed: windowInfo.consumed,
				kind: windowInfo.kind,
				label: t(WINDOW_LABEL_KEYS[windowInfo.kind]),
				limit: windowInfo.limit,
				resetAt: windowInfo.reset_at,
			})),
		[subscriptionStatus.windows, t],
	);

	return {
		actions: {
			refresh: handleRefreshRemote,
		},
		expiry: formatExpiry(subscriptionStatus.expires_at),
		goProvider,
		labels,
		now,
		refreshing,
		showGoCard,
		status: subscriptionStatus,
		windows,
	};
}
