import type { JSX } from "react";

interface ToolbarButtonProps {
	label: string;
	onClick: () => void;
	disabled?: boolean;
}

export function ToolbarButton({ label, onClick, disabled }: ToolbarButtonProps): JSX.Element {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="rounded-md px-2.5 py-1 text-[12px] text-[var(--foreground)] hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
		>
			{label}
		</button>
	);
}
