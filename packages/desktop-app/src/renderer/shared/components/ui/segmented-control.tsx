import { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { cn } from "../../lib/utils";

export interface SegmentedControlItem<T extends string> {
	key: T;
	label: string;
	icon?: string;
}

interface SegmentedControlProps<T extends string> {
	items: SegmentedControlItem<T>[];
	value: T;
	onChange: (value: T) => void;
	className?: string;
}

export function SegmentedControl<T extends string>({
	items,
	value,
	onChange,
	className,
}: SegmentedControlProps<T>): JSX.Element {
	const containerRef = useRef<HTMLDivElement>(null);
	const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});
	const [ready, setReady] = useState(false);

	const updateIndicator = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const activeIndex = items.findIndex((item) => item.key === value);
		const buttons = container.querySelectorAll<HTMLButtonElement>("[data-segment-btn]");
		const activeBtn = buttons[activeIndex];
		if (!activeBtn) return;
		setIndicatorStyle({
			width: activeBtn.offsetWidth,
			transform: `translateX(${activeBtn.offsetLeft}px)`,
		});
		setReady(true);
	}, [items, value]);

	useLayoutEffect(() => {
		updateIndicator();
	}, [updateIndicator]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(() => updateIndicator());
		observer.observe(container);
		return () => observer.disconnect();
	}, [updateIndicator]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative inline-flex rounded-[8px] bg-black/[0.06] p-[2px] dark:bg-white/[0.08]",
				className,
			)}
		>
			{/* Sliding indicator */}
			<div
				className={cn(
					"absolute top-[2px] bottom-[2px] left-0 rounded-[6px] bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(0,0,0,0.04)] dark:bg-white/[0.12] dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_0_0_0.5px_rgba(255,255,255,0.06)]",
					ready
						? "transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
						: "transition-none",
				)}
				style={indicatorStyle}
			/>
			{items.map(({ key, label, icon }) => (
				<button
					key={key}
					type="button"
					data-segment-btn=""
					onClick={() => onChange(key)}
					className={cn(
						"relative z-10 flex items-center justify-center gap-1 rounded-[6px] px-2.5 py-[3px] text-[11px] font-medium leading-[16px] transition-colors duration-150 select-none",
						value === key
							? "text-foreground"
							: "text-muted-foreground hover:text-foreground/70",
					)}
				>
					{icon && <span className={cn(icon, "h-3 w-3")} />}
					{label}
				</button>
			))}
		</div>
	);
}
