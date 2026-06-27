import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
	activeKnowledgeBaseIdAtom,
	knowledgeBasesAtom,
	knowledgeImportDraftAtom,
	refreshKnowledgeBasesAtom,
} from "@shared/store/atoms";
import type { KnowledgeBase } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import { cn } from "@shared/lib/utils";
import { useNarrowScreen } from "@shared/hooks/useNarrowScreen";
import {
	countKnowledgeNodes,
	formatKnowledgeUpdatedAt,
	knowledgeBaseDisplayName,
} from "../lib/knowledge-base";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

export function KnowledgeBaseListPage(): JSX.Element {
	const { t } = useTranslation("settings");
	const knowledgeBases = useAtomValue(knowledgeBasesAtom);
	const activeId = useAtomValue(activeKnowledgeBaseIdAtom);
	const setActiveId = useSetAtom(activeKnowledgeBaseIdAtom);
	const setDraft = useSetAtom(knowledgeImportDraftAtom);
	const refresh = useSetAtom(refreshKnowledgeBasesAtom);
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const narrow = useNarrowScreen();

	useEffect(() => {
		void refresh();
	}, [refresh]);

	const filteredBases = useMemo(() => {
		const query = search.trim().toLocaleLowerCase();
		return [...knowledgeBases]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.filter((base) => {
				if (!query) return true;
				return knowledgeBaseDisplayName(base).toLocaleLowerCase().includes(query);
			});
	}, [knowledgeBases, search]);

	const openKnowledgeBase = (base: KnowledgeBase) => {
		setActiveId(base.id);
		void navigate({ to: "/knowledge" });
	};

	const createKnowledgeBase = () => {
		setDraft({ sourcePaths: [], defaultTargetId: null, createOnly: true });
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
				<motion.div
					initial={{ opacity: 0, y: -8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.45, ease: EASE_OUT }}
				>
					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon-sm"
							title={t("kbAllBack")}
							onClick={() => void navigate({ to: "/knowledge" })}
						>
							<span className="icon-[mdi--arrow-left] h-4 w-4" />
						</Button>
						<h1 className="text-[24px] font-bold tracking-tight text-foreground">{t("kbAllTitle")}</h1>
						<motion.span
							key={knowledgeBases.length}
							initial={{ opacity: 0, scale: 0.85 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.25, ease: EASE_OUT }}
							className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
						>
							{knowledgeBases.length}
						</motion.span>
					</div>
					<p className="ml-9 mt-1 text-[12px] text-muted-foreground/60">
						{t("kbAllSubtitle")}
					</p>
				</motion.div>
				<motion.div
					initial={{ opacity: 0, y: -6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, delay: 0.06, ease: EASE_OUT }}
					className="flex items-center gap-2"
				>
					<div className={cn("relative", narrow ? "min-w-0 flex-1" : "w-64")}>
						<span className="icon-[mdi--magnify] absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
						<Input
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("kbAllSearch")}
							className="h-8 border-transparent bg-muted/55 pl-8 pr-3 text-[12px] shadow-none placeholder:text-muted-foreground/45 hover:bg-muted/75 focus-visible:border-primary/25 focus-visible:bg-background/70 focus-visible:ring-1 focus-visible:ring-primary/15"
						/>
					</div>
					<Button variant="primary" onClick={createKnowledgeBase}>
						<span className="icon-[mdi--plus] h-4 w-4" />
						{t("kbCreateBase")}
					</Button>
				</motion.div>
			</header>

			<div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
				<AnimatePresence mode="popLayout">
					{filteredBases.length > 0 ? (
						<motion.div
							key="knowledge-grid"
							layout
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 6 }}
							transition={{ duration: 0.35, ease: EASE_OUT }}
							className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
						>
							<AnimatePresence mode="popLayout">
								{filteredBases.map((base, index) => {
									const stats = countKnowledgeNodes(base.nodes);
									const active = base.id === activeId;
									return (
										<motion.div
											key={base.id}
											layout
											initial={{ opacity: 0, y: 10, scale: 0.985 }}
											animate={{ opacity: 1, y: 0, scale: 1 }}
											exit={{ opacity: 0, y: 4, scale: 0.985 }}
											transition={{
												duration: 0.28,
												delay: Math.min(index * 0.035, 0.18),
												ease: EASE_OUT,
												layout: { duration: 0.24, ease: EASE_OUT },
											}}
											whileHover={{ y: -2 }}
											whileTap={{ scale: 0.99 }}
											className="flex"
										>
											<Button
												variant="ghost"
												onClick={() => openKnowledgeBase(base)}
												className={cn(
													"group h-auto min-h-36 w-full items-stretch justify-start whitespace-normal rounded-xl border p-4 text-left transition-[background-color,border-color,box-shadow]",
													active
														? "border-primary/25 bg-primary/6 hover:bg-primary/10 hover:shadow-sm"
														: "border-border bg-muted/25 hover:bg-muted/55 hover:shadow-sm",
												)}
											>
												<div className="flex w-full flex-col">
													<div className="flex items-start justify-between gap-3">
														<div
															className={cn(
																"flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
																active
																	? "bg-primary/12 text-primary"
																	: "bg-accent text-muted-foreground group-hover:text-foreground",
															)}
														>
															<span className="icon-[mdi--book-open-variant-outline] h-4 w-4" />
														</div>
														{active && (
															<motion.span
																initial={{ opacity: 0, scale: 0.85 }}
																animate={{ opacity: 1, scale: 1 }}
																className="rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-medium text-primary"
															>
																{t("kbCurrent")}
															</motion.span>
														)}
													</div>
													<h2 className="mt-3 truncate text-[13px] font-semibold text-foreground">
														{knowledgeBaseDisplayName(base)}
													</h2>
													<div className="mt-auto flex items-center gap-2 pt-3 text-[10px] text-muted-foreground/50">
														<span>{t("kbDirCount", { n: stats.directories })}</span>
														<span>·</span>
														<span>{t("kbFileCount", { n: stats.files })}</span>
														<span className="ml-auto">
															{formatKnowledgeUpdatedAt(base.updatedAt)}
														</span>
													</div>
												</div>
											</Button>
										</motion.div>
									);
								})}
							</AnimatePresence>
						</motion.div>
					) : (
						<motion.div
							key="knowledge-empty"
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 6 }}
							transition={{ duration: 0.35, ease: EASE_OUT }}
							className="flex h-full min-h-72 flex-col items-center justify-center text-center"
						>
							<motion.span
								className="icon-[mdi--bookshelf] h-10 w-10 text-muted-foreground/30"
								initial={{ scale: 0.9 }}
								animate={{ scale: 1 }}
								transition={{ duration: 0.4, ease: EASE_OUT }}
							/>
							<p className="mt-3 text-[13px] font-medium text-foreground">
								{knowledgeBases.length === 0 ? t("kbAllEmptyNone") : t("kbAllEmptyNoMatch")}
							</p>
							<p className="mt-1 text-[11px] text-muted-foreground/55">
								{knowledgeBases.length === 0 ? t("kbAllEmptyNoneDesc") : t("kbAllEmptyNoMatchDesc")}
							</p>
							{knowledgeBases.length === 0 && (
								<Button variant="primary" className="mt-4" onClick={createKnowledgeBase}>
									<span className="icon-[mdi--plus] h-4 w-4" />
									{t("kbCreateBase")}
								</Button>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
