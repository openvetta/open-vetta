import { cn } from "@shared/lib/utils";

export function SettingRow({
	title,
	description,
	children,
	border = true,
}: {
	title: string;
	description?: string;
	children: React.ReactNode;
	border?: boolean;
}): JSX.Element {
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-6 px-5 py-4",
				border && "border-b border-border",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-foreground">{title}</div>
				{description && (
					<div className="mt-0.5 text-[12px] text-muted-foreground">{description}</div>
				)}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}

export function SettingSection({
	title,
	children,
}: {
	title: React.ReactNode;
	children: React.ReactNode;
}): JSX.Element {
	return (
		<div className="mb-6">
			{typeof title === "string" ? (
				<h2 className="mb-3 text-[15px] font-semibold text-foreground">{title}</h2>
			) : (
				<div className="mb-3 text-[15px] font-semibold text-foreground">{title}</div>
			)}
			<div className="overflow-hidden rounded-xl border border-border bg-muted">
				{children}
			</div>
		</div>
	);
}
