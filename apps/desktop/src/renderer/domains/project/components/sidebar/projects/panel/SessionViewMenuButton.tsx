import { ContextMenuView } from "@vetta-org/theme-ui/shared";
import { SidebarSectionActionButton } from "@vetta-org/theme-ui/sidebar/SidebarSectionActionButton";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useSidebarSessionViewMenu } from "../../../../hooks/useSidebarSessionViewMenu";

/** 项目区标题行的「更多」：打开侧栏会话的分组与排序设置。 */
export function SessionViewMenuButton(): JSX.Element {
	const { t } = useTranslation("project");
	const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
	const close = useCallback(() => setAnchor(null), []);
	const items = useSidebarSessionViewMenu(close);

	return (
		<>
			<SidebarSectionActionButton
				aria-haspopup="menu"
				expanded={anchor !== null}
				iconClassName="icon-[solar--menu-dots-bold]"
				label={t("sidebar.view.menu")}
				onClick={(event) => {
					const rect = event.currentTarget.getBoundingClientRect();
					setAnchor({ x: rect.left, y: rect.bottom + 4 });
				}}
			/>
			{anchor
				? createPortal(<ContextMenuView items={items} onClose={close} x={anchor.x} y={anchor.y} />, document.body)
				: null}
		</>
	);
}
