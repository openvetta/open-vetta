import type { Button } from "@shared/components/ui/button";
type HostButton = typeof Button;
export type { HostButton as _HostPrimitiveHoldButton };
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
	// 始终左右：左标题/说明、右控件。
	// 标题区保留 min-w-0 以便过长时截断，但用 truncate 避免中文被压成单字竖列；
	// 右侧限制 max-w，防止大控件（如 ModelSelect）把左侧挤没。
	return (
		<div
			className={cn(
				"flex items-center justify-between gap-6 px-5 py-4",
				border && "border-b border-border",
			)}
		>
			<div className="min-w-0 flex-1 basis-0">
				<div className="truncate text-[13px] font-medium text-foreground" title={title}>
					{title}
				</div>
				{description && (
					<div className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground" title={description}>
						{description}
					</div>
				)}
			</div>
			<div className="max-w-[min(100%,24rem)] shrink-0">{children}</div>
		</div>
	);
}

export function SettingSection({
	section,
	title,
	description,
	children,
	t,
}: {
	section: SettingsSectionRegistration;
	title?: React.ReactNode;
	description?: string;
	children: React.ReactNode;
	t?: (key: string) => string;
}): JSX.Element {
	const renderedTitle = title !== undefined ? title : t && section.titleKey ? t(section.titleKey) : section.title;
	const hasTitle =
		renderedTitle != null &&
		renderedTitle !== false &&
		!(typeof renderedTitle === "string" && renderedTitle.trim() === "");
	return (
		<div
			className="mb-6 p-1.5"
			data-setting-section-highlight-target={section.id}
		>
			{hasTitle &&
				(typeof renderedTitle === "string" ? (
					<h2
						id={section.id}
						className={cn("text-[15px] font-semibold text-foreground", description ? "mb-1" : "mb-3")}
					>
						{renderedTitle}
					</h2>
				) : (
					<div
						id={section.id}
						className={cn("text-[15px] font-semibold text-foreground", description ? "mb-1" : "mb-3")}
					>
						{renderedTitle}
					</div>
				))}
			{description && <p className="mb-3 text-[12px] text-muted-foreground">{description}</p>}
			<div
				id={hasTitle ? undefined : section.id}
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
	t,
}: {
	section: SettingsSectionRegistration;
	title?: React.ReactNode;
	className?: string;
	t?: (key: string) => string;
}): JSX.Element {
	const renderedTitle = title ?? (t && section.titleKey ? t(section.titleKey) : section.title);
	return (
		<h2
			id={section.id}
			className={cn("text-[15px] font-semibold text-foreground", className)}
		>
			{renderedTitle}
		</h2>
	);
}
