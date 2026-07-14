import { useMatches, useNavigate } from "@tanstack/react-router";
import type { ThemeNavigationTarget, ThemeRouteArea, ThemeRouteModel } from "@vetta/theme-sdk/routing";

function resolveRouteArea(pathname: string): ThemeRouteArea {
	if (pathname === "/automation") return "automation";
	if (pathname === "/batch-tasks") return "batchTasks";
	if (pathname === "/knowledge" || pathname === "/knowledge/all") return "knowledgeBase";
	if (pathname === "/skills") return "skills";
	if (pathname === "/plugins") return "plugins";
	if (pathname.startsWith("/settings")) return "settings";
	if (pathname.startsWith("/project")) return "project";
	if (pathname === "/downloads") return "downloads";
	if (pathname.startsWith("/theme/")) return "themePage";
	if (pathname === "/" || pathname.startsWith("/new-session") || pathname.startsWith("/viewer")) return "chat";
	return "unknown";
}

export function useThemeRouteModel(): ThemeRouteModel {
	const matches = useMatches();
	const navigate = useNavigate();
	const pathname = matches[matches.length - 1]?.pathname ?? "/";
	const area = resolveRouteArea(pathname);

	const navigateToTarget = (target: ThemeNavigationTarget): void => {
		switch (target.kind) {
			case "automation":
				void navigate({ to: "/automation" });
				return;
			case "batchTasks":
				void navigate({ to: "/batch-tasks" });
				return;
			case "chat":
				void navigate({ to: "/" });
				return;
			case "downloads":
				void navigate({ to: "/downloads" });
				return;
			case "knowledgeBase":
				void navigate({ to: "/knowledge" });
				return;
			case "knowledgeBaseList":
				void navigate({ to: "/knowledge/all" });
				return;
			case "plugins":
				void navigate({ to: "/plugins" });
				return;
			case "skills":
				void navigate({ to: "/skills" });
				return;
		}
	};

	return {
		current: {
			area,
			pathname,
		},
		isAreaActive: (targetArea) => area === targetArea,
		navigate: navigateToTarget,
	};
}
