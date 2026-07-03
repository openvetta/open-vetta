import { cn } from "@shared/lib/utils";
import { useThemeComponent } from "@vetta/theme-sdk";
import { useWindowControlsModel } from "@vetta/theme-sdk/app-shell";
import { ThemeSurface } from "@vetta/theme-ui/appearance";
import { WindowControlButton } from "./WindowControlButton";
import type { WindowControlsComponentProps, WindowControlsProps } from "./types";

export function DefaultWindowControls({ className, classNames, model }: WindowControlsComponentProps): JSX.Element {
	const ThemeWindowControlButton = useThemeComponent("app.windowControlButton", WindowControlButton);

	if (model.isMac) {
		return <div className={cn("w-[70px]", className)} />;
	}

	return (
		<div className={cn("relative overflow-visible", className)} data-theme-surface-root="app.windowControls">
			<ThemeSurface slot="app.windowControls" />
			<div className="relative z-10 flex items-center gap-0.5">
				{model.controls.map((control) => (
					<ThemeWindowControlButton
						key={control.kind}
						control={control}
						className={cn(classNames?.button, control.kind === "close" && classNames?.closeButton)}
						iconClassName={classNames?.icon}
					/>
				))}
			</div>
		</div>
	);
}

export function WindowControls(props: WindowControlsProps): JSX.Element {
	const model = useWindowControlsModel();
	const ThemeWindowControls = useThemeComponent("app.windowControls", DefaultWindowControls);
	return <ThemeWindowControls {...props} model={model} />;
}
