import type { JSX, ReactNode } from "react";
import { useThemeComponent } from "@vetta/theme-sdk";
import type { PageHeaderRegionProps } from "@vetta/theme-sdk/app-shell";
import { PageHeaderContent } from "./PageHeaderContent";
import { PageHeaderFrame } from "./PageHeaderFrame";

export interface DefaultPageHeaderProps extends PageHeaderRegionProps {
	/** Host-provided window chrome (connected WindowControls). */
	windowControls?: ReactNode;
}

export function DefaultPageHeader({
	className,
	classNames,
	model,
	narrow,
	onExpandSidebar,
	onOverlayClose,
	onOverlayOpen,
	windowControls,
}: DefaultPageHeaderProps): JSX.Element {
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
				windowControls={windowControls}
			/>
		</PageHeaderFrame>
	);
}
