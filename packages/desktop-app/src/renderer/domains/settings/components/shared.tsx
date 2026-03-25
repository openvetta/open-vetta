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
				border && "border-b border-[var(--border)]",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-[var(--text-1)]">{title}</div>
				{description && (
					<div className="mt-0.5 text-[12px] text-[var(--text-2)]">{description}</div>
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
				<h2 className="mb-3 text-[15px] font-semibold text-[var(--text-1)]">{title}</h2>
			) : (
				<div className="mb-3 text-[15px] font-semibold text-[var(--text-1)]">{title}</div>
			)}
			<div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
				{children}
			</div>
		</div>
	);
}
