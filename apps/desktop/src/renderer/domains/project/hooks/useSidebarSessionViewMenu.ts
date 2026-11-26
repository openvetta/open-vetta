import { type SidebarSessionGrouping, type SidebarSessionSort, sidebarSessionViewAtom } from "@shared/store/atoms";
import type { ContextMenuNode } from "@vetta-org/theme-ui/shared";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";

const GROUPINGS = [
	{ value: "project", labelKey: "sidebar.view.groupByProject" },
	{ value: "flat", labelKey: "sidebar.view.flat" },
] as const satisfies readonly { value: SidebarSessionGrouping; labelKey: string }[];

const SORTS = [
	{ value: "updated", labelKey: "sidebar.view.sortUpdated" },
	{ value: "created", labelKey: "sidebar.view.sortCreated" },
] as const satisfies readonly { value: SidebarSessionSort; labelKey: string }[];

/** 侧栏会话的「分组方式 / 排序方式」两组菜单，供项目区与对话区的更多菜单复用。 */
export function useSidebarSessionViewMenu(onClose: () => void): ContextMenuNode[] {
	const { t } = useTranslation("project");
	const [view, setView] = useAtom(sidebarSessionViewAtom);
	return [
		{
			kind: "submenu",
			id: "session-grouping",
			label: t("sidebar.view.grouping"),
			iconClassName: "icon-[solar--layers-minimalistic-linear]",
			items: GROUPINGS.map(
				({ value, labelKey }): ContextMenuNode => ({
					kind: "item",
					id: `grouping-${value}`,
					label: t(labelKey),
					checked: view.grouping === value,
					onSelect: () => {
						setView({ grouping: value });
						onClose();
					},
				}),
			),
		},
		{
			kind: "submenu",
			id: "session-sort",
			label: t("sidebar.view.sort"),
			iconClassName: "icon-[solar--sort-vertical-linear]",
			items: SORTS.map(
				({ value, labelKey }): ContextMenuNode => ({
					kind: "item",
					id: `sort-${value}`,
					label: t(labelKey),
					checked: view.sort === value,
					onSelect: () => {
						setView({ sort: value });
						onClose();
					},
				}),
			),
		},
	];
}
