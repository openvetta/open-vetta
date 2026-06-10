import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
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
	// 窄屏：标题/描述与右侧控件改为上下堆叠，避免控件挤压文本导致逐字换行。
	const narrow = useNarrowScreen();
	return (
		<div
			className={cn(
				"flex gap-6 px-5 py-4",
				narrow ? "flex-col items-stretch gap-3" : "items-center justify-between",
				border && "border-b border-border",
			)}
		>
			<div className="min-w-0 flex-1">
				<div className="text-[13px] font-medium text-foreground">{title}</div>
				{description && (
					<div className="mt-0.5 text-[12px] text-muted-foreground">{description}</div>
				)}
			</div>
			<div className={cn(!narrow && "shrink-0")}>{children}</div>
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
