import type { ErrorComponentProps } from "@tanstack/react-router";
import type { RouteErrorPageViewProps } from "@vetta-org/theme-ui/overlays";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

export function useRouteErrorPageModel({
	error,
	reset,
}: ErrorComponentProps): Omit<RouteErrorPageViewProps, "homeAction"> {
	const { t } = useTranslation("common");
	const message = error instanceof Error ? error.message : String(error);

	useEffect(() => {
		console.error("[router error]", error);
	}, [error]);

	return useMemo(
		() => ({
			labels: {
				bannerTitle: t("routeError.bannerTitle"),
				home: t("routeError.home"),
				pageTitle: t("routeError.pageTitle"),
				retry: t("routeError.retry"),
				retryPage: t("routeError.retryPage"),
				suggestion: t("routeError.suggestion"),
			},
			message,
			onRetry: reset,
		}),
		[message, reset, t],
	);
}
