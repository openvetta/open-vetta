import { useCallback, useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import { isMac } from "../../lib/platform";

interface WindowControlsProps {
	className?: string;
}

export function WindowControls({ className }: WindowControlsProps): JSX.Element {
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (isMac) return;

		void window.vetta.window.isMaximized().then(setIsMaximized);
		return window.vetta.window.onMaximizedChanged(setIsMaximized);
	}, []);

	const handleMinimize = useCallback(() => {
		void window.vetta.window.minimize();
	}, []);

	const handleMaximize = useCallback(async () => {
		await window.vetta.window.maximize();
		const maximized = await window.vetta.window.isMaximized();
		setIsMaximized(maximized);
	}, []);

	const handleClose = useCallback(() => {
		void window.vetta.window.close();
	}, []);

	if (isMac) {
		return <div className={cn("w-[70px]", className)} />;
	}

	return (
		<div className={cn("flex items-center gap-0.5", className)}>
			<button
				type="button"
				onClick={handleMinimize}
				title="最小化"
				className="flex h-8 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent/50 active:opacity-70"
				aria-label="最小化"
			>
				<span className="icon-[mdi--window-minimize] h-4 w-4" />
			</button>
			<button
				type="button"
				onClick={handleMaximize}
				title={isMaximized ? "还原" : "最大化"}
				className="flex h-8 w-11 items-center justify-center rounded-md text-foreground hover:bg-accent/50 active:opacity-70"
				aria-label={isMaximized ? "还原" : "最大化"}
			>
				{isMaximized ? (
					<span className="icon-[mdi--window-restore] h-4 w-4" />
				) : (
					<span className="icon-[mdi--window-maximize] h-4 w-4" />
				)}
			</button>
			<button
				type="button"
				onClick={handleClose}
				title="关闭"
				className="flex h-8 w-11 items-center justify-center rounded-md text-foreground hover:bg-[#e81123] hover:text-white active:opacity-70"
				aria-label="关闭"
			>
				<span className="icon-[mdi--close] h-4 w-4" />
			</button>
		</div>
	);
}
