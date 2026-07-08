import { useThemeComponent, useThemeRegion } from "@vetta/theme-sdk";
import { usePageHeaderModel } from "@vetta/theme-sdk/app-shell";
import { PageHeaderContent } from "./PageHeaderContent";
import { PageHeaderFrame } from "./PageHeaderFrame";
import type { PageHeaderProps, PageHeaderRegionProps } from "./types";

export function DefaultPageHeader({
	className,
	classNames,
	model,
	narrow,
	onExpandSidebar,
	onOverlayClose,
	onOverlayOpen,
}: PageHeaderRegionProps): JSX.Element {
	const ThemePageHeaderContent = useThemeComponent("app.pageHeaderContent", PageHeaderContent);

	return (
		<PageHeaderFrame
			className={className}
			contentClassName={classNames?.content}
			triggerVisible={model.triggerVisible}
		>
			<ThemePageHeaderContent
				actions={{ onExpandSidebar, onOverlayClose, onOverlayOpen }}
				classNames={classNames}
				model={model}
				narrow={narrow}
			/>
		</PageHeaderFrame>
	);
}

export function PageHeader(props: PageHeaderProps): JSX.Element {
	const model = usePageHeaderModel(props);
	const ThemePageHeader = useThemeRegion("app.pageHeader");
	if (ThemePageHeader) {
		return <ThemePageHeader {...props} model={model} />;
	}
	return <DefaultPageHeader {...props} model={model} />;
}
