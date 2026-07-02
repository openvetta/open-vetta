import { useAuth } from "@domains/auth/hooks/useAuth";
import { useTheme } from "@shared/hooks/useTheme";
import { downloadsActiveCountAtom, loginDialogOpenAtom, type ThemeMode, themeModeAtom } from "@shared/store/atoms";
import { creditsBalanceAtom, creditsUnlimitedAtom, subscriptionStatusAtom } from "@shared/store/auth-atoms";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue, useSetAtom } from "jotai";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SettingsMenuModel, SettingsMenuThemeOption } from "./types";

export function useSettingsMenuModel(open: boolean, setOpen: (open: boolean) => void): SettingsMenuModel {
	const { t } = useTranslation("settings");
	const mode = useAtomValue(themeModeAtom);
	const activeDownloads = useAtomValue(downloadsActiveCountAtom);
	const { setMode } = useTheme();
	const navigate = useNavigate();
	const setLoginOpen = useSetAtom(loginDialogOpenAtom);
	const { user, logout } = useAuth();
	const creditsBalance = useAtomValue(creditsBalanceAtom);
	const creditsUnlimited = useAtomValue(creditsUnlimitedAtom);
	const subscription = useAtomValue(subscriptionStatusAtom);

	const goEnabled = subscription.go_enabled;
	const fiveHourWindowRaw = goEnabled ? subscription.windows?.find((window) => window.kind === "5h") : undefined;
	const fiveHourWindow = fiveHourWindowRaw && fiveHourWindowRaw.limit > 0 ? fiveHourWindowRaw : undefined;
	const fiveHourRemainingPercent = fiveHourWindow
		? Math.max(0, Math.min(100, Math.round((1 - fiveHourWindow.consumed / fiveHourWindow.limit) * 100)))
		: 0;
	const themeOptions: SettingsMenuThemeOption[] = [
		{ value: "light", label: t("theme.light"), icon: "icon-[solar--sun-linear]" },
		{ value: "dark", label: t("theme.dark"), icon: "icon-[solar--moon-linear]" },
		{ value: "auto", label: t("theme.system"), icon: "icon-[solar--laptop-linear]" },
	];

	return {
		activeDownloads,
		creditsBalance,
		creditsUnlimited,
		fiveHourRemainingPercent,
		fiveHourResetAt: fiveHourWindow?.reset_at,
		goBadgeColor: subscription.badge_color,
		goBadgeText: subscription.badge_text,
		goEnabled,
		mode,
		open,
		subscriptionTierName: subscription.tier_name,
		themeOptions,
		user,
		zenEnabled: subscription.zen_enabled,
		actions: {
			login: () => {
				setOpen(false);
				setLoginOpen(true);
			},
			logout: () => {
				setOpen(false);
				logout();
			},
			openDownloads: () => {
				setOpen(false);
				void navigate({ to: "/downloads" });
			},
			openSettings: () => {
				setOpen(false);
				void navigate({ to: "/settings/$tab", params: { tab: "account" } });
			},
			setMode: (nextMode: ThemeMode, event: MouseEvent<HTMLButtonElement>) => {
				void setMode(nextMode, {
					x: event.clientX,
					y: event.clientY,
				});
			},
			setOpen,
		},
	};
}

export function useRefreshBillingOnOpen(): (open: boolean, userPresent: boolean) => void {
	const setCreditsBalance = useSetAtom(creditsBalanceAtom);
	const setCreditsUnlimited = useSetAtom(creditsUnlimitedAtom);
	const setSubscriptionStatus = useSetAtom(subscriptionStatusAtom);

	return (open: boolean, userPresent: boolean): void => {
		if (!open || !userPresent) return;
		void window.vetta.credits
			.getBalance()
			.then((result) => {
				setCreditsBalance(result.balance);
				setCreditsUnlimited(result.unlimited ?? false);
			})
			.catch(console.error);
		void window.vetta.subscription
			.getStatus()
			.then((result) => {
				if (result.status) setSubscriptionStatus(result.status);
			})
			.catch(console.error);
	};
}
