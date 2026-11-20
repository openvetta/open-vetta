import { useEffect, useRef, useState, type JSX } from "react";
import { Button } from "@vetta-org/ui/button";
import { cn } from "@vetta-org/ui/utils";
import { VettaKbd } from "../shared/VettaKbd";

export interface ShortcutRecorderViewProps {
	readonly value: string;
	readonly onChange: (shortcut: string) => void;
	readonly onReset: () => void;
	readonly isDefault: boolean;
	readonly placeholder: string;
	readonly resetLabel: string;
	/** Host provides platform-specific key → shortcut parsing. */
	readonly eventToShortcut: (event: KeyboardEvent) => string | null;
}

export function ShortcutRecorderView({
	value,
	onChange,
	onReset,
	isDefault,
	placeholder,
	resetLabel,
	eventToShortcut,
}: ShortcutRecorderViewProps): JSX.Element {
	const [recording, setRecording] = useState(false);
	const [pendingKeys, setPendingKeys] = useState<string | null>(null);
	const inputRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!recording) return;

		function handleKeyDown(e: KeyboardEvent) {
			e.preventDefault();
			e.stopPropagation();

			const shortcut = eventToShortcut(e);
			if (!shortcut) return;

			setPendingKeys(shortcut);
			onChange(shortcut);
			setRecording(false);
		}

		function handleBlur() {
			setRecording(false);
			setPendingKeys(null);
		}

		document.addEventListener("keydown", handleKeyDown, true);
		inputRef.current?.addEventListener("blur", handleBlur);
		const btn = inputRef.current;

		return () => {
			document.removeEventListener("keydown", handleKeyDown, true);
			btn?.removeEventListener("blur", handleBlur);
		};
	}, [recording, onChange, eventToShortcut]);

	const displayedShortcut = pendingKeys ?? value;

	return (
		<div className="flex items-center gap-2">
			<button
				ref={inputRef}
				type="button"
				onClick={() => {
					setRecording(true);
					setPendingKeys(null);
				}}
				className={cn(
					// 与设置页下拉（SELECT_TRIGGER_CLASS）一致：无可见边框，边界靠透明边框占位。
					"flex h-8 min-w-[120px] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12px] font-medium transition-colors outline-none",
					recording
						? "animate-pulse border-primary/50 bg-primary/10 text-foreground"
						: "border-transparent bg-muted text-foreground hover:bg-accent focus-visible:border-primary/50",
				)}
			>
				{recording ? (
					<span className="text-[12px]">{placeholder}</span>
				) : displayedShortcut ? (
					<VettaKbd keys={displayedShortcut} size="sm" />
				) : (
					<span className="text-[12px] text-muted-foreground">—</span>
				)}
			</button>
			{!isDefault && (
				<Button variant="ghost" size="icon-xs" onClick={onReset} title={resetLabel}>
					<span className="icon-[mdi--restore] h-3.5 w-3.5" />
				</Button>
			)}
		</div>
	);
}
