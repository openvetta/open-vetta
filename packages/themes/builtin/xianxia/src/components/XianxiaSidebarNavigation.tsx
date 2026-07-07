import {
	type NavIndicatorBounds,
	SidebarNavigation,
	type SidebarNavigationProps,
	type SidebarNavItem,
} from "@vetta/desktop-theme-ui/sidebar";
import { useThemePagesModel } from "@vetta/theme-sdk/pages";
import type { JSX } from "react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

function getNavIndicatorBounds(element: HTMLButtonElement): NavIndicatorBounds {
	return {
		height: element.offsetHeight,
		left: element.offsetLeft,
		top: element.offsetTop,
		width: element.offsetWidth,
	};
}

export function XianxiaSidebarNavigation(props: SidebarNavigationProps): JSX.Element {
	const themePages = useThemePagesModel();
	const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const themePageItems = useMemo<SidebarNavItem[]>(
		() =>
			themePages.navItems.map((item) => ({
				active: item.active,
				icon: item.icon ?? "icon-[solar--stars-linear]",
				key: item.key,
				label: item.label,
				title: item.label,
				type: "custom",
			})),
		[themePages.navItems],
	);
	const items = useMemo(
		() => [...props.items, ...themePageItems],
		[props.items, themePageItems],
	);
	const activeIndex = items.findIndex((item) => item.active);
	const [indicatorBounds, setIndicatorBounds] = useState<NavIndicatorBounds | null>(null);
	const setItemRef = useCallback(
		(index: number) => (element: HTMLButtonElement | null) => {
			itemRefs.current[index] = element;
			props.setItemRef(index)(element);
		},
		[props],
	);

	useLayoutEffect(() => {
		const activeElement = itemRefs.current[activeIndex];
		if (!activeElement) {
			setIndicatorBounds(null);
			return;
		}
		setIndicatorBounds(getNavIndicatorBounds(activeElement));
	}, [activeIndex]);

	return (
		<SidebarNavigation
			{...props}
			indicatorBounds={indicatorBounds}
			items={items}
			onItemClick={(item) => {
				const page = themePages.navItems.find((navItem) => navItem.key === item.key);
				if (page) {
					themePages.actions.openPage(page.pageId);
					return;
				}
				props.onItemClick(item);
			}}
			setItemRef={setItemRef}
		/>
	);
}
