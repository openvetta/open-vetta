import type { JSX, KeyboardEvent } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vetta/ui";

export function SelectField({
	value,
	onChange,
	options,
}: {
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
}): JSX.Element {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger
				size="sm"
				className="h-8 w-full border-input bg-secondary text-[12px] hover:bg-accent dark:bg-secondary dark:hover:bg-accent"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent position="popper" align="start">
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value} className="text-[12px]">
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function InputField({
	value,
	onChange,
	placeholder,
	type = "text",
	disabled,
	onBlur,
	onKeyDown,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
	disabled?: boolean;
	onBlur?: () => void;
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}): JSX.Element {
	return (
		<input
			type={type}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onBlur}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			className="h-8 w-full rounded-lg border border-input bg-secondary px-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring disabled:cursor-not-allowed disabled:opacity-50"
		/>
	);
}

export function TextareaField({
	value,
	onChange,
	placeholder,
	rows = 3,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
}): JSX.Element {
	return (
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className="w-full resize-none rounded-lg border border-input bg-secondary px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring"
		/>
	);
}

export function CheckboxField({
	checked,
	onChange,
	label,
}: {
	checked: boolean;
	onChange: (v: boolean) => void;
	label: string;
}): JSX.Element {
	return (
		<label className="flex cursor-pointer select-none items-center gap-2">
			<button
				type="button"
				onClick={() => onChange(!checked)}
				className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
					checked ? "border-primary bg-primary" : "border-input bg-secondary hover:bg-accent"
				}`}
			>
				{checked && <span className="icon-[mdi--check] h-3 w-3 text-primary-foreground" />}
			</button>
			<span className="text-[12px] text-foreground">{label}</span>
		</label>
	);
}
