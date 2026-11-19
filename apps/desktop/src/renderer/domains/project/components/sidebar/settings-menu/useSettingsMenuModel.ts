import { useImOnline } from "@shared/hooks/useImOnline";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { SettingsMenuModel } from "./types";

export function useSettingsMenuModel(): SettingsMenuModel {
	const { t: tProject } = useTranslation("project");
	const navigate = useNavigate();
	const pathname = useLocation({ select: (location) => location.pathname });
	const clawOnline = useImOnline();

	return {
		active: pathname.startsWith("/settings"),
		clawOnline,
		clawTitle: tProject("sidebar.clawConnected"),
		actions: {
			openSettings: () => {
				void navigate({ to: "/settings/$tab", params: { tab: "general" } });
			},
		},
	};
}
