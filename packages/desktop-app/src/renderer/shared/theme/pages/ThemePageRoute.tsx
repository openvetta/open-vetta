import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useActiveThemePageRoute } from "./useActiveThemePageRoute";

export function ThemePageRoute(): JSX.Element | null {
	const navigate = useNavigate();
	const themePageRoute = useActiveThemePageRoute();

	useEffect(() => {
		if (themePageRoute?.isThemePageRoute && !themePageRoute.page) {
			void navigate({ to: "/", replace: true });
		}
	}, [navigate, themePageRoute]);

	if (!themePageRoute?.page) return null;

	const Page = themePageRoute.page.component;
	return (
		<Page
			layout={themePageRoute.layout}
			pageId={themePageRoute.pageId}
			themeId={themePageRoute.themeId}
		/>
	);
}
