import { sidebarWidthAtom } from "@shared/store/atoms";
import { isMac } from "@shared/lib/platform";
import { SidebarTopBar as ThemeSidebarTopBar } from "@vetta/theme-ui/sidebar";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { AgentModeBadgeDropdown } from "./AgentModeBadgeDropdown";
import { SidebarUpdateButton } from "./update/SidebarUpdateButton";

/**
 * 侧栏窄于该宽度时工作模式徽章只显示 icon。
 * Mac 顶栏左侧预留给红绿灯（~78px）且 brand 常为空，可用空间更大，阈值更低；
 * 非 Mac 左侧有 logo + 「Vetta」文案，需更早收成 icon。
 */
const AGENT_MODE_BADGE_COMPACT_WIDTH = isMac ? 168 : 200;

interface SidebarTopBarProps {
	className?: string;
	classNames?: {
		actions?: string;
		brand?: string;
		collapseButton?: string;
	};
	floating: boolean;
	onCollapse?: () => void;
}

/** Desktop adapter: i18n + connected update button slot + 工作模式徽章 popover。 */
export function SidebarTopBar({ className, classNames, floating, onCollapse }: SidebarTopBarProps): JSX.Element {
	const { t } = useTranslation("project");
	const sidebarWidth = useAtomValue(sidebarWidthAtom);
	const agentModeCompact = sidebarWidth < AGENT_MODE_BADGE_COMPACT_WIDTH;

	return (
		<ThemeSidebarTopBar
			agentModeSlot={<AgentModeBadgeDropdown compact={agentModeCompact} />}
			brandTrailing={<SidebarUpdateButton />}
			className={className}
			classNames={classNames}
			floating={floating}
			labels={{
				hide: t("sidebar.hide"),
			}}
			onCollapse={onCollapse}
		/>
	);
}
