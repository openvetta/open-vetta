import type { JSX } from "react";

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
		<div className="relative">
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				className="h-8 w-full appearance-none rounded-lg border border-input bg-secondary pl-3 pr-8 text-[12px] text-foreground outline-none transition-colors hover:bg-accent focus:border-ring"
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			<span className="icon-[mdi--chevron-down] pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
		</div>
	);
}

export function InputField({
	value,
	onChange,
	placeholder,
	type = "text",
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
}): JSX.Element {
	return (
		<input
			type={type}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			className="h-8 w-full rounded-lg border border-input bg-secondary px-3 text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus:border-ring"
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
