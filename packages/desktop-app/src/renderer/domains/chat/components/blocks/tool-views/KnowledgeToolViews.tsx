import { useTranslation } from "react-i18next";

import type { ToolCallBlock } from "@shared/store/atoms";

function TagChip({ label, count }: { label: string; count?: number }): JSX.Element {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
			<span className="icon-[mdi--tag-outline] h-3 w-3 opacity-70" />
			{label}
			{count !== undefined && <span className="text-[10px] text-primary/60">{count}</span>}
		</span>
	);
}

/** kb_filter_by_tags：命中页列表（标题 + 摘要 + 标签 + 路径）。 */
export function KbFilterByTagsView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const kb = block.uiDetails?.knowledge;
	if (!kb || kb.kind !== "filter") return null;
	if (kb.count === 0)
		return <div className="py-1 text-[11px] text-muted-foreground/50">{t("filterByTags.noResults")}</div>;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-[11px] text-muted-foreground/60">{t("filterByTags.hitCount", { count: kb.count })}</div>
			{kb.pages.map((p) => (
				<div key={p.id} className="rounded-lg border border-input/60 bg-muted/20 px-2.5 py-1.5">
					<div className="text-[12px] font-medium text-foreground">{p.title || t("filterByTags.noTitle")}</div>
					{p.summary && <div className="mt-0.5 text-[11px] text-muted-foreground/70">{p.summary}</div>}
					{p.tags.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-1">
							{p.tags.map((t) => (
								<TagChip key={t} label={t} />
							))}
						</div>
					)}
					<div className="mt-1 truncate text-[10px] text-muted-foreground/40" title={p.absolutePath}>
						{p.absolutePath}
					</div>
				</div>
			))}
		</div>
	);
}

/** kb_list_available_tags：标签云（带页数）。 */
export function KbListTagsView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const kb = block.uiDetails?.knowledge;
	if (!kb || kb.kind !== "tags") return null;
	if (kb.tags.length === 0)
		return <div className="py-1 text-[11px] text-muted-foreground/50">{t("listTags.empty")}</div>;
	return (
		<div className="flex flex-col gap-1.5">
			<div className="text-[11px] text-muted-foreground/60">{t("listTags.tagCount", { count: kb.tags.length })}</div>
			<div className="flex flex-wrap gap-1.5">
				{kb.tags.map((t) => (
					<TagChip key={t.tag} label={t.tag} count={t.count} />
				))}
			</div>
		</div>
	);
}

/** kb_write_page：写入结果（动作 + 路径）。 */
export function KbWritePageView({ block }: { block: ToolCallBlock }): JSX.Element | null {
	const { t } = useTranslation("chat");
	const kb = block.uiDetails?.knowledge;
	if (!kb || kb.kind !== "write")
		return <div className="py-1 text-[11px] text-muted-foreground/50">{t("knowledgeTools.empty")}</div>;
	const actionLabel = kb.action === "create" ? t("writePage.actionCreate") : t("writePage.actionUpdate");
	const actionIcon = kb.action === "create" ? "icon-[mdi--file-plus-outline]" : "icon-[mdi--file-edit-outline]";
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-input/60 bg-muted/20 px-2.5 py-1.5">
			<div className="flex items-center gap-1.5 text-[12px] font-medium text-foreground">
				<span className={`${actionIcon} h-3.5 w-3.5 text-primary`} />
				{actionLabel}
			</div>
			<div className="truncate text-[11px] text-muted-foreground/70" title={kb.absolutePath}>
				{kb.absolutePath}
			</div>
			{kb.movedFrom && (
				<div className="text-[10px] text-muted-foreground/40">{t("writePage.originalLocation", { path: kb.movedFrom })}</div>
			)}
		</div>
	);
}
