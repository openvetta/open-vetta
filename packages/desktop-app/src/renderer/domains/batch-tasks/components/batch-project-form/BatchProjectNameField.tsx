import { Input } from "@shared/components/ui/input";

export function BatchProjectNameField({
	name,
	onChange,
	placeholder,
}: {
	name: string;
	onChange: (value: string) => void;
	placeholder: string;
}): JSX.Element {
	return (
		<div className="flex items-center gap-3">
			<div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-inset ring-primary/20">
				<span className="icon-[solar--layers-linear] h-4 w-4 text-primary" />
			</div>
			<Input
				value={name}
				onChange={(event) => onChange(event.target.value)}
				className="h-8 w-full border-none bg-transparent text-[15px] font-semibold text-foreground placeholder:text-muted-foreground/40 focus:outline-none! focus-visible:outline-none!"
				placeholder={placeholder}
				autoFocus
			/>
		</div>
	);
}
