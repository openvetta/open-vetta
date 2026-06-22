import type { KnowledgeBase } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@shared/components/ui/popover";
import { cn } from "@shared/lib/utils";
import { countKnowledgeNodes, formatKnowledgeUpdatedAt } from "../lib/knowledge-base";

interface KnowledgeBasePickerProps {
	bases: KnowledgeBase[];
	activeBase: KnowledgeBase;
	onSelect: (id: string) => void;
	onCreate: () => void;
	onViewAll: () => void;
}

const QUICK_LIST_LIMIT = 6;

export function KnowledgeBasePicker({
	bases,
	activeBase,
	onSelect,
	onCreate,
	onViewAll,
}: KnowledgeBasePickerProps): JSX.Element {
	const quickBases = [
		activeBase,
		...bases
			.filter((base) => base.id !== activeBase.id)
			.sort((a, b) => b.updatedAt - a.updatedAt),
	].slice(0, QUICK_LIST_LIMIT);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					className="h-auto min-w-0 justify-start gap-2 px-2 py-1.5 text-left"
				>
					<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<span className="icon-[mdi--book-open-variant-outline] h-4 w-4" />
					</div>
					<div className="min-w-0">
						<div className="flex items-center gap-1.5">
							<span className="max-w-64 truncate text-[13px] font-semibold text-foreground">
								{activeBase.name}
							</span>
							<span className="icon-[mdi--chevron-down] h-3.5 w-3.5 text-muted-foreground" />
						</div>
						<p className="truncate text-[10.5px] text-muted-foreground/55">
							{formatKnowledgeUpdatedAt(activeBase.updatedAt)}
						</p>
					</div>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-80 gap-1 p-1.5">
				<div className="px-2 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/50">
					切换知识库
				</div>
				{quickBases.map((base) => {
					const fileCount = countKnowledgeNodes(base.nodes).files;
					const active = base.id === activeBase.id;
					return (
						<Button
							key={base.id}
							type="button"
							variant="ghost"
							onClick={() => onSelect(base.id)}
							className={cn(
								"h-auto w-full justify-start gap-2.5 px-2 py-2 text-left",
								active ? "bg-primary/10" : "hover:bg-accent",
							)}
						>
							<span
								className={cn(
									"icon-[mdi--book-outline] h-4 w-4 shrink-0",
									active ? "text-primary" : "text-muted-foreground",
								)}
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate text-[12px] font-medium text-foreground">{base.name}</p>
								<p className="mt-0.5 text-[10px] text-muted-foreground/55">{fileCount} 个文件</p>
							</div>
							{active && <span className="icon-[mdi--check] h-4 w-4 text-primary" />}
						</Button>
					);
				})}
				<div className="my-1 h-px bg-border/60" />
				<Button
					type="button"
					variant="ghost"
					onClick={onViewAll}
					className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-foreground"
				>
					<span className="icon-[mdi--view-grid-outline] h-4 w-4 text-muted-foreground" />
					<span className="flex-1 text-left">查看全部知识库</span>
					<span className="text-[10px] tabular-nums text-muted-foreground/45">{bases.length}</span>
				</Button>
				<Button
					type="button"
					variant="ghost"
					onClick={onCreate}
					className="h-8 w-full justify-start gap-2 px-2 text-[12px] font-medium text-primary hover:bg-primary/10 hover:text-primary"
				>
					<span className="icon-[mdi--plus] h-4 w-4" />
					新建知识库
				</Button>
			</PopoverContent>
		</Popover>
	);
}
