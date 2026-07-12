import { SidebarTopBar as ThemeSidebarTopBar } from "@vetta/theme-ui/sidebar";
import { useTranslation } from "react-i18next";
import { SidebarUpdateButton } from "./update/SidebarUpdateButton";

interface SidebarTopBarProps {
	className?: string;
	classNames?: {
		actions?: string;
		brand?: string;
		clawButton?: string;
		collapseButton?: string;
	};
	floating: boolean;
	imOnline: boolean;
	onCollapse?: () => void;
	onOpenClawSettings: () => void;
}

/** Desktop adapter: i18n + connected update button slot. */
export function SidebarTopBar({
	className,
	classNames,
	floating,
	imOnline,
	onCollapse,
	onOpenClawSettings,
}: SidebarTopBarProps): JSX.Element {
	const { t } = useTranslation("project");

	return (
		<ThemeSidebarTopBar
			brandTrailing={<SidebarUpdateButton />}
			className={className}
			classNames={classNames}
			floating={floating}
			imOnline={imOnline}
			labels={{
				clawConnected: t("sidebar.clawConnected"),
				hide: t("sidebar.hide"),
			}}
			onCollapse={onCollapse}
			onOpenClawSettings={onOpenClawSettings}
		/>
	);
}
