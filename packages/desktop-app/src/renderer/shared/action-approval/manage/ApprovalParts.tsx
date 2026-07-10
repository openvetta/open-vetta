import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/** 与 batch-tasks / scheduler 审批 UI 一致的信息行 */
export function ApprovalValueRow({
	label,
	value,
	mono,
}: {
	label: string;
	value: string;
	mono?: boolean;
}): JSX.Element {
	return (
		<div className="flex items-start justify-between gap-4 py-1.5">
			<span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
			<span
				className={cn(
					"min-w-0 break-words text-right text-[11px] font-medium text-foreground",
					mono && "break-all font-mono text-[10px]",
				)}
			>
				{value}
			</span>
		</div>
	);
}

export function ApprovalValueList({
	rows,
}: {
	rows: ReadonlyArray<{ label: string; value: string; mono?: boolean }>;
}): JSX.Element {
	return (
		<div className="rounded-lg border border-border/50 bg-background/50 px-3">
			{rows.map((row, index) => (
				<div key={`${row.label}-${index}`}>
					{index > 0 && <div className="h-px bg-border/40" />}
					<ApprovalValueRow label={row.label} value={row.value} mono={row.mono} />
				</div>
			))}
		</div>
	);
}

/** 目标实体卡片（对齐 BatchTasksTaskApproval / Scheduler dialog） */
export function ApprovalTargetCard({
	icon,
	title,
	subtitle,
	badge,
	rows,
}: {
	icon: string;
	title: string;
	subtitle?: string;
	badge?: string;
	rows?: ReadonlyArray<{ label: string; value: string; mono?: boolean }>;
}): JSX.Element {
	return (
		<div className="rounded-lg border border-border/50 bg-background/50 p-3">
			<div className="flex items-start gap-3">
				<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
					<span className={`${icon} h-4 w-4 text-muted-foreground`} />
				</div>
				<div className="min-w-0 flex-1">
					<div className="truncate text-[12px] font-semibold text-foreground">{title}</div>
					{subtitle && <div className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground">{subtitle}</div>}
				</div>
				{badge && (
					<span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
						{badge}
					</span>
				)}
			</div>
			{rows && rows.length > 0 && (
				<div className="mt-3 space-y-0 border-t border-border/40 pt-1">
					{rows.map((row) => (
						<ApprovalValueRow key={row.label} label={row.label} value={row.value} mono={row.mono} />
					))}
				</div>
			)}
		</div>
	);
}

/** 「执行后会发生什么」说明卡 */
export function ApprovalImpactCard({
	icon,
	title,
	description,
	destructive,
}: {
	icon: string;
	title: string;
	description: string;
	destructive?: boolean;
}): JSX.Element {
	return (
		<div
			className={cn(
				"rounded-lg border p-3",
				destructive ? "border-destructive/30 bg-destructive/10" : "border-primary/20 bg-primary/5",
			)}
		>
			<div className="flex gap-2">
				<span
					className={cn(
						`${icon} mt-0.5 h-4 w-4 shrink-0`,
						destructive ? "text-destructive" : "text-primary",
					)}
				/>
				<div>
					<div className="text-[11px] font-semibold text-foreground">{title}</div>
					<p className="mt-1 text-[11px] leading-5 text-muted-foreground">{description}</p>
				</div>
			</div>
		</div>
	);
}

export function ApprovalWarningCard({ children }: { children: ReactNode }): JSX.Element {
	return (
		<div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">
			<span className="icon-[mdi--alert-outline] mt-0.5 h-4 w-4 shrink-0" />
			<p className="text-[11px] leading-5">{children}</p>
		</div>
	);
}

export function ApprovalFormField({
	id,
	label,
	children,
}: {
	id: string;
	label: string;
	children: ReactNode;
}): JSX.Element {
	return (
		<div className="rounded-lg border border-border/50 bg-background/50 p-3">
			<label
				className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
				htmlFor={id}
			>
				{label}
			</label>
			{children}
		</div>
	);
}

export function ApprovalRawFallback({ input }: { input: unknown }): JSX.Element {
	return (
		<pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/50 bg-background/50 p-3 font-mono text-[10px] leading-4 text-foreground">
			{JSON.stringify(input, null, 2)}
		</pre>
	);
}
