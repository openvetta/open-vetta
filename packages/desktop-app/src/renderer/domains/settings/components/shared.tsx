import { cn } from "@shared/lib/utils";
import type { SettingsSectionRegistration } from "../registry";

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
	section,
	title,
	description,
	children,
}: {
	section: SettingsSectionRegistration;
	title?: React.ReactNode;
	description?: string;
	children: React.ReactNode;
}): JSX.Element {
	const renderedTitle = title ?? section.title;
	return (
		<div
			className="mb-6 p-1.5"
			data-setting-section-highlight-target={section.id}
		>
			{typeof renderedTitle === "string" ? (
				<h2 id={section.id} className={cn("text-[15px] font-semibold text-foreground", description ? "mb-1" : "mb-3")}>{renderedTitle}</h2>
			) : (
				<div id={section.id} className={cn("text-[15px] font-semibold text-foreground", description ? "mb-1" : "mb-3")}>{renderedTitle}</div>
			)}
			{description && <p className="mb-3 text-[12px] text-muted-foreground">{description}</p>}
			<div
				className="overflow-hidden rounded-xl border border-border bg-muted"
				data-setting-section-id={section.id}
			>
				{children}
			</div>
		</div>
	);
}

export function SettingHeading({
	section,
	title,
	className,
}: {
	section: SettingsSectionRegistration;
	title?: React.ReactNode;
	className?: string;
}): JSX.Element {
	const renderedTitle = title ?? section.title;
	return (
		<h2
			id={section.id}
			className={cn("text-[15px] font-semibold text-foreground", className)}
		>
			{renderedTitle}
		</h2>
	);
}
