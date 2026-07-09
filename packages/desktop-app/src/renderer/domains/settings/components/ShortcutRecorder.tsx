import { useEffect, useRef, useState } from "react";
import { Button } from "@shared/components/ui/button";
import { cn } from "@shared/lib/utils";
import { eventToShortcut, formatShortcut } from "@shared/lib/platform";

export function ShortcutRecorder({
	value,
	onChange,
	onReset,
	isDefault,
	placeholder,
	resetLabel,
}: {
	value: string;
	onChange: (shortcut: string) => void;
	onReset: () => void;
	isDefault: boolean;
	placeholder: string;
	resetLabel: string;
}): JSX.Element {
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
	}, [recording, onChange]);

	const displayValue = pendingKeys ? formatShortcut(pendingKeys) : formatShortcut(value);

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
					"flex h-[30px] min-w-[120px] items-center justify-center rounded-lg border px-3 text-[12px] font-mono transition-colors",
					recording
						? "animate-pulse border-primary bg-primary/10 text-foreground"
						: "border-input bg-muted text-foreground hover:bg-secondary",
				)}
			>
				{recording ? placeholder : displayValue}
			</button>
			{!isDefault && (
				<Button variant="ghost" size="icon-xs" onClick={onReset} title={resetLabel}>
					<span className="icon-[mdi--restore] h-3.5 w-3.5" />
				</Button>
			)}
		</div>
	);
}
