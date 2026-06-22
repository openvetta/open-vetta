import { useMemo, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import {
	activeKnowledgeBaseIdAtom,
	knowledgeBasesAtom,
	knowledgeImportDraftAtom,
} from "@shared/store/atoms";
import type { KnowledgeBase } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import { countKnowledgeNodes, formatKnowledgeUpdatedAt } from "../lib/knowledge-base";

export function KnowledgeBaseListPage(): JSX.Element {
	const knowledgeBases = useAtomValue(knowledgeBasesAtom);
	const activeId = useAtomValue(activeKnowledgeBaseIdAtom);
	const setActiveId = useSetAtom(activeKnowledgeBaseIdAtom);
	const setDraft = useSetAtom(knowledgeImportDraftAtom);
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const narrow = useNarrowScreen();

	const filteredBases = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		return [...knowledgeBases]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.filter((base) => {
				if (!query) return true;
				return (
					base.name.toLocaleLowerCase().includes(query) ||
					base.description.toLocaleLowerCase().includes(query)
				);
			});
	}, [knowledgeBases, search]);

	const openKnowledgeBase = (base: KnowledgeBase) => {
		setActiveId(base.id);
		void navigate({ to: "/knowledge" });
	};

	const createKnowledgeBase = () => {
		setDraft({ items: [], targetKnowledgeBaseId: null, source: "create" });
		void navigate({ to: "/knowledge" });
	};

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header
				className={cn(
					"flex shrink-0 gap-4 px-8 pb-5 pt-7",
					narrow ? "flex-col items-stretch" : "items-end justify-between",
				)}
			>
				<div>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							title="返回知识库"
							onClick={() => void navigate({ to: "/knowledge" })}
						>
							<span className="icon-[mdi--arrow-left] h-4 w-4" />
						</Button>
						<h1 className="text-[24px] font-bold tracking-tight text-foreground">全部知识库</h1>
						<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
							{knowledgeBases.length}
						</span>
					</div>
					<p className="ml-9 mt-1 text-[12px] text-muted-foreground/60">
						查找并打开已有知识库
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className={cn("relative", narrow ? "min-w-0 flex-1" : "w-64")}>
						<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="搜索知识库"
							className="h-8 border-transparent bg-muted/55 pl-8 pr-3 text-[12px] shadow-none placeholder:text-muted-foreground/45 hover:bg-muted/75 focus-visible:border-primary/25 focus-visible:bg-background/70 focus-visible:ring-1 focus-visible:ring-primary/15"
						/>
					</div>
					<Button variant="primary" onClick={createKnowledgeBase}>
						<span className="icon-[mdi--plus] h-4 w-4" />
						新建知识库
					</Button>
				</div>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
				{filteredBases.length > 0 ? (
					<div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
						{filteredBases.map((base) => {
							const stats = countKnowledgeNodes(base.nodes);
							const active = base.id === activeId;
							return (
								<Button
									key={base.id}
									variant="ghost"
									onClick={() => openKnowledgeBase(base)}
									className={cn(
										"group h-auto min-h-36 items-stretch justify-start whitespace-normal rounded-xl border p-4 text-left",
										active
											? "border-primary/25 bg-primary/6 hover:bg-primary/10"
											: "border-border bg-muted/25 hover:bg-muted/55",
									)}
								>
									<div className="flex w-full flex-col">
										<div className="flex items-start justify-between gap-3">
											<div
												className={cn(
													"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
													active ? "bg-primary/12 text-primary" : "bg-accent text-muted-foreground",
												)}
											>
												<span className="icon-[mdi--book-open-variant-outline] h-4 w-4" />
											</div>
											{active && (
												<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-medium text-primary">
													当前
												</span>
											)}
										</div>
										<h2 className="mt-3 truncate text-[13px] font-semibold text-foreground">
											{base.name}
										</h2>
										<p className="mt-1 line-clamp-2 min-h-8 text-[11px] leading-4 text-muted-foreground/60">
											{base.description || "暂无描述"}
										</p>
										<div className="mt-auto flex items-center gap-2 pt-3 text-[10px] text-muted-foreground/50">
											<span>{stats.directories} 个目录</span>
											<span>·</span>
											<span>{stats.files} 个文件</span>
											<span className="ml-auto">{formatKnowledgeUpdatedAt(base.updatedAt)}</span>
										</div>
									</div>
								</Button>
							);
						})}
					</div>
				) : (
					<div className="flex h-full min-h-72 flex-col items-center justify-center text-center">
						<span className="icon-[mdi--bookshelf] h-10 w-10 text-muted-foreground/30" />
						<p className="mt-3 text-[13px] font-medium text-foreground">
							{knowledgeBases.length === 0 ? "还没有知识库" : "没有匹配的知识库"}
						</p>
						<p className="mt-1 text-[11px] text-muted-foreground/55">
							{knowledgeBases.length === 0 ? "创建一个知识库开始整理资料" : "尝试使用其他关键词"}
						</p>
						{knowledgeBases.length === 0 && (
							<Button variant="primary" className="mt-4" onClick={createKnowledgeBase}>
								<span className="icon-[mdi--plus] h-4 w-4" />
								新建知识库
							</Button>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
