import { useEffect, useId, useRef, useState, type JSX } from "react";

const TRIGGER =
	"flex h-7 w-full min-w-[8rem] max-w-[16rem] items-center gap-1.5 rounded-lg bg-card px-2.5 text-[12px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-60";
const MENU_ITEM =
	"flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-left text-[12px] font-medium transition-colors";

export type BoardSelectOption<T extends string> = {
	value: T;
	label: string;
};

export function BoardSelect<T extends string>({
	label,
	value,
	options,
	onChange,
	triggerIcon,
	disabled,
}: {
	label: string;
	value: T;
	options: ReadonlyArray<BoardSelectOption<T>>;
	onChange: (next: T) => void;
	triggerIcon?: string;
	disabled?: boolean;
}): JSX.Element {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerId = useId();
	const selected = options.find((option) => option.value === value);
	const triggerLabel = selected?.label ?? value;

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (rootRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="flex min-w-[8rem] flex-col gap-1">
			<label className="text-xs font-medium text-muted-foreground" htmlFor={triggerId}>
				{label}
			</label>
			<div className="relative">
				<button
					aria-expanded={open}
					aria-haspopup="menu"
					aria-label={label}
					className={`${TRIGGER} ${open ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"}`}
					disabled={disabled}
					id={triggerId}
					title={triggerLabel}
					type="button"
					onClick={() => setOpen((current) => !current)}
				>
					{triggerIcon ? <span className={`${triggerIcon} h-3.5 w-3.5 shrink-0`} aria-hidden /> : null}
					<span className="min-w-0 truncate">{triggerLabel}</span>
					<span className="icon-[solar--alt-arrow-down-linear] h-3 w-3 shrink-0 opacity-70" aria-hidden />
				</button>
				{open ? (
					<div
						className="absolute left-0 top-full z-50 mt-1.5 max-h-64 min-w-full overflow-y-auto overflow-x-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
						role="menu"
					>
						{options.map((option) => {
							const selectedOption = option.value === value;
							return (
								<button
									className={`${MENU_ITEM} ${
										selectedOption ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
									}`}
									key={option.value}
									role="menuitem"
									title={option.label}
									type="button"
									onClick={() => {
										onChange(option.value);
										setOpen(false);
									}}
								>
									<span className="min-w-0 truncate">{option.label}</span>
									{selectedOption ? (
										<span
											className="icon-[solar--check-circle-linear] ml-auto h-3.5 w-3.5 shrink-0 text-primary"
											aria-hidden
										/>
									) : null}
								</button>
							);
						})}
					</div>
				) : null}
			</div>
		</div>
	);
}
