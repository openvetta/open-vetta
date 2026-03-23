import { type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/platform";
import { WindowControls } from "./WindowControls";

export interface TitleBarProps {
	className?: string;
	children?: ReactNode;
}

export function TitleBar({ className, children }: TitleBarProps): JSX.Element | null {
	if (isMac) {
		return null;
	}

	return (
		<header className={cn("title-bar flex h-9 shrink-0 items-center bg-[var(--header-bg)] select-none", className)}>
			<div className="drag-region flex flex-1 items-center gap-2 px-3">
				<img
					src="./icon.png"
					alt="Vetta"
					className="h-4 w-4 rounded-[4px]"
				/>
				<span className="text-[12px] font-medium text-[var(--text-1)]">Vetta</span>
			</div>
			{children}
			<div className="flex items-center pr-1">
				<WindowControls />
			</div>
		</header>
	);
}
