import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { activeSessionAtom, debugToolSearchAtom, debugToolFilterAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import type { ToolCallRecord } from "../../../../preload/api.js";

type FilterValue = "all" | "success" | "error";

// labelKey 存 i18n key（chat 命名空间），渲染期解析——模块级常量不放中文。
type FilterLabelKey =
	| "activityPanel.toolCalls.filterAll"
	| "activityPanel.toolCalls.filterSuccess"
	| "activityPanel.toolCalls.filterError";
const FILTER_OPTIONS: { value: FilterValue; labelKey: FilterLabelKey }[] = [
	{ value: "all", labelKey: "activityPanel.toolCalls.filterAll" },
	{ value: "success", labelKey: "activityPanel.toolCalls.filterSuccess" },
	{ value: "error", labelKey: "activityPanel.toolCalls.filterError" },
];

function formatTime(timestamp: string): string {
	try {
		const d = new Date(timestamp);
		return d.toLocaleTimeString("zh-CN", { hour12: false });
	} catch {
		return timestamp;
	}
}

export function ToolCallsSubTab({ cwd }: { cwd: string }): JSX.Element {
	const { t } = useTranslation("chat");
	const activeSession = useAtomValue(activeSessionAtom);
	const [search, setSearch] = useAtom(debugToolSearchAtom);
	const [filter, setFilter] = useAtom(debugToolFilterAtom);
	const [records, setRecords] = useState<ToolCallRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const sessionPath = activeSession?.sessionPath ?? null;

	const loadData = useCallback(async () => {
		if (!sessionPath) {
			setRecords([]);
			return;
		}
		setLoading(true);
		try {
			const data = await window.vetta.debug.parseToolCalls(sessionPath);
			setRecords(data);
		} catch {
			setRecords([]);
		} finally {
			setLoading(false);
		}
	}, [sessionPath]);

	useEffect(() => {
		void loadData();
	}, [loadData]);

	const filtered = useMemo(() => {
		let list = records;
		if (filter === "success") list = list.filter((r) => !r.isError);
		if (filter === "error") list = list.filter((r) => r.isError);
		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter((r) => r.toolName.toLowerCase().includes(q));
		}
		return list;
	}, [records, filter, search]);

	const toggleExpand = useCallback((id: string) => {
		setExpandedId((prev) => (prev === id ? null : id));
	}, []);

	if (!sessionPath) {
		return (
			<div className="flex flex-1 items-center justify-center p-4 text-[12px] text-muted-foreground">
				{t("activityPanel.toolCalls.noSession")}
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Search + Filter bar */}
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
				<div className="relative flex-1">
					<span className="icon-[mdi--magnify] absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
					<input
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={t("activityPanel.toolCalls.searchPlaceholder")}
						className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-2 text-[12px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
					/>
				</div>
				<div className="flex shrink-0 items-center gap-0.5 rounded-md border border-input bg-background p-0.5">
					{FILTER_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => setFilter(opt.value)}
							className={cn(
								"rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
								filter === opt.value
									? "bg-secondary text-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{t(opt.labelKey)}
						</button>
					))}
				</div>
			</div>

			{/* Refresh */}
			<div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-1">
				<span className="text-[11px] text-muted-foreground">
					{loading
						? t("activityPanel.toolCalls.loading")
						: t("activityPanel.toolCalls.recordCount", { count: filtered.length })}
				</span>
				<button
					type="button"
					onClick={() => void loadData()}
					className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					title={t("activityPanel.toolCalls.refresh")}
				>
					<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
				</button>
			</div>

			{/* Timeline list */}
			<div className="flex-1 overflow-y-auto">
				{filtered.length === 0 && !loading && (
					<div className="p-4 text-center text-[12px] text-muted-foreground">
						{records.length === 0
							? t("activityPanel.toolCalls.empty")
							: t("activityPanel.toolCalls.noMatch")}
					</div>
				)}
				{filtered.map((record) => {
					const isExpanded = expandedId === record.id;
					return (
						<div
							key={record.id}
							className={cn("border-b border-border", record.isError && "border-l-2 border-l-destructive")}
						>
							<button
								type="button"
								onClick={() => toggleExpand(record.id)}
								className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-secondary/50"
							>
								<span
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										isExpanded ? "icon-[mdi--chevron-down]" : "icon-[mdi--chevron-right]",
										"text-muted-foreground",
									)}
								/>
								<span className="flex-1 truncate text-[12px] font-medium text-foreground">
									{record.toolName}
								</span>
								<span className="shrink-0 text-[11px] text-muted-foreground">
									{formatTime(record.timestamp)}
								</span>
								<span
									className={cn(
										"h-3.5 w-3.5 shrink-0",
										record.isError
											? "icon-[mdi--close-circle] text-destructive"
											: record.result !== undefined
												? "icon-[mdi--check-circle] text-green-500"
												: "icon-[mdi--clock-outline] text-muted-foreground",
									)}
								/>
							</button>
							{isExpanded && (
								<div className="border-t border-border bg-muted/30 px-3 py-2">
									<div className="mb-1 text-[11px] font-medium text-muted-foreground">
										{t("activityPanel.toolCalls.args")}
									</div>
									<pre className="mb-2 max-h-[200px] overflow-auto rounded-md bg-background p-2 text-[11px] text-foreground">
										{JSON.stringify(record.args, null, 2)}
									</pre>
									{record.result !== undefined && (
										<>
											<div className="mb-1 text-[11px] font-medium text-muted-foreground">
												{t("activityPanel.toolCalls.result")}
											</div>
											<pre className="max-h-[300px] overflow-auto rounded-md bg-background p-2 text-[11px] text-foreground">
												{typeof record.result === "string"
													? record.result
													: JSON.stringify(record.result, null, 2)}
											</pre>
										</>
									)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
