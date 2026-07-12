import type { CSSProperties, JSX, ReactNode } from "react";
import { cn } from "@vetta/ui";

export interface AchievementNavigationAssets {
	readonly activeBackground: string;
	readonly disabledBackground: string;
	readonly activeArrow: string;
	readonly disabledArrow: string;
}

export interface AchievementNavigationButtonViewProps {
	readonly disabled: boolean;
	readonly direction: "previous" | "next";
	readonly label: string;
	readonly onClick: () => void;
	readonly assets: AchievementNavigationAssets;
	/**
	 * Optional host control wrapper. When omitted, uses a native button with the same
	 * layout classes (ghost chrome fully overridden by className).
	 */
	readonly renderControl?: (props: {
		disabled: boolean;
		label: string;
		onClick: () => void;
		className: string;
		style: CSSProperties;
		children: ReactNode;
	}) => ReactNode;
}

/**
 * Achievement carousel prev/next control. Presentation assets + layout; optional host Button slot.
 */
export function AchievementNavigationButtonView({
	disabled,
	direction,
	label,
	onClick,
	assets,
	renderControl,
}: AchievementNavigationButtonViewProps): JSX.Element {
	const previous = direction === "previous";
	const className = cn(
		"absolute top-1/2 z-30 h-[120px] w-[60px] rounded-none border-0 bg-transparent p-0 hover:bg-transparent disabled:opacity-100",
		previous ? "left-16" : "right-16",
	);
	const style: CSSProperties = {
		transform: "translateY(-50%)",
		pointerEvents: "auto",
		cursor: disabled ? "default" : "pointer",
	};

	const children = (
		<>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={assets.activeBackground}
				className={cn(
					"pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150",
					disabled ? "opacity-0" : "opacity-100",
				)}
			/>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={assets.disabledBackground}
				className={cn(
					"pointer-events-none absolute inset-0 h-full w-full object-contain transition-opacity duration-150",
					disabled ? "opacity-100" : "opacity-0",
				)}
			/>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={assets.activeArrow}
				className={cn(
					"pointer-events-none relative z-10 w-10 object-contain transition-opacity duration-150",
					previous && "rotate-180",
					disabled ? "opacity-0" : "opacity-100",
				)}
			/>
			<img
				aria-hidden="true"
				alt=""
				draggable={false}
				src={assets.disabledArrow}
				className={cn(
					"pointer-events-none absolute left-1/2 top-1/2 z-10 w-10 -translate-x-1/2 -translate-y-1/2 object-contain transition-opacity duration-150",
					previous && "rotate-180",
					disabled ? "opacity-100" : "opacity-0",
				)}
			/>
		</>
	);

	if (renderControl) {
		return <>{renderControl({ disabled, label, onClick, className, style, children })}</>;
	}

	return (
		<button
			type="button"
			disabled={disabled}
			aria-label={label}
			title={label}
			className={className}
			style={style}
			onClick={onClick}
		>
			{children}
		</button>
	);
}
