import { cn } from "@vetta-org/ui";
import type { FocusEventHandler, JSX, KeyboardEvent, Ref } from "react";
import { MotionSelect } from "./MotionSelect";

/**
 * @deprecated 基础 Select 已产品化；设置页请优先 {@link MotionSelect}。
 * 保留空串兼容旧 `cn(SETTINGS_SELECT_TRIGGER_CLASS, …)` 调用。
 */
export const SETTINGS_SELECT_TRIGGER_CLASS = "";

/** @deprecated 见上。 */
export const SETTINGS_SELECT_ITEM_CLASS = "";

export function SelectField({
	id,
	value,
	onChange,
	options,
	"aria-label": ariaLabel,
}: {
	id?: string;
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
	"aria-label"?: string;
}): JSX.Element {
	return (
		<MotionSelect
			id={id}
			aria-label={ariaLabel}
			value={value}
			onValueChange={onChange}
			options={options}
			triggerClassName="w-full"
		/>
	);
}

export function InputField({
	id,
	ref,
	value,
	onChange,
	placeholder,
	type = "text",
	disabled,
	onBlur,
	onKeyDown,
	autoFocus,
	"aria-label": ariaLabel,
	className,
}: {
	id?: string;
	ref?: Ref<HTMLInputElement>;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
	disabled?: boolean;
	onBlur?: FocusEventHandler<HTMLInputElement>;
	onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
	autoFocus?: boolean;
	"aria-label"?: string;
	className?: string;
}): JSX.Element {
	return (
		<input
			id={id}
			ref={ref}
			type={type}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
			onBlur={onBlur}
			onKeyDown={onKeyDown}
			placeholder={placeholder}
			// biome-ignore lint/a11y/noAutofocus: Preserve the public native input contract for callers that explicitly request initial focus.
			autoFocus={autoFocus}
			aria-label={ariaLabel}
			className={cn(
				"h-8 w-full rounded-lg border border-border bg-card px-2.5 text-[12px] font-medium text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus-visible:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
		/>
	);
}

export function TextareaField({
	id,
	value,
	onChange,
	placeholder,
	rows = 3,
	"aria-label": ariaLabel,
}: {
	id?: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	rows?: number;
	"aria-label"?: string;
}): JSX.Element {
	return (
		<textarea
			id={id}
			aria-label={ariaLabel}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors hover:bg-accent focus-visible:border-primary/50"
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
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="h-4 w-4 shrink-0 cursor-pointer accent-primary focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-ring"
			/>
			<span className="text-[12px] text-foreground">{label}</span>
		</label>
	);
}
