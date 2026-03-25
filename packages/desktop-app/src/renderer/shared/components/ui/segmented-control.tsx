import { useRef, useState, useEffect, useCallback } from "react";
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

	const updateIndicator = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const activeIndex = items.findIndex((item) => item.key === value);
		const buttons = container.querySelectorAll<HTMLButtonElement>("[data-segment-btn]");
		const activeBtn = buttons[activeIndex];
		if (!activeBtn) return;
		setIndicatorStyle({
			width: activeBtn.offsetWidth,
			left: activeBtn.offsetLeft,
		});
	}, [items, value]);

	useEffect(() => {
		updateIndicator();
	}, [updateIndicator]);

	return (
		<div
			ref={containerRef}
			className={cn(
				"relative flex rounded-lg bg-[var(--surface-raised)] p-[3px]",
				className,
			)}
		>
			{/* Animated active indicator */}
			<div
				className="absolute top-[3px] bottom-[3px] rounded-md bg-[var(--content-bg)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_0_0_0.5px_rgba(0,0,0,0.04)] transition-all duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
				style={indicatorStyle}
			/>
			{items.map(({ key, label, icon }) => (
				<button
					key={key}
					type="button"
					data-segment-btn=""
					onClick={() => onChange(key)}
					className={cn(
						"relative z-10 flex items-center justify-center gap-1.5 rounded-md px-3 py-[5px] text-[12px] font-medium transition-colors duration-200",
						value === key
							? "text-[var(--text-1)]"
							: "text-[var(--text-3)] hover:text-[var(--text-2)]",
					)}
				>
					{icon && <span className={cn(icon, "h-3.5 w-3.5")} />}
					{label}
				</button>
			))}
		</div>
	);
}
