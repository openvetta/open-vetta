import { useMemo, useState } from "react";
import type {
	KnowledgeBase,
	KnowledgeImportDraft,
	KnowledgeNode,
} from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { getFileIcon } from "@domains/file-explorer/components/fileIcons";
import { cn } from "@shared/lib/utils";
import { buildSuggestedTree } from "../lib/knowledge-base";

export interface KnowledgeImportConfirmation {
	targetId: string | null;
	name: string;
	description: string;
	nodes: KnowledgeNode[];
}

interface KnowledgeImportDialogProps {
	draft: KnowledgeImportDraft;
	knowledgeBases: KnowledgeBase[];
	activeKnowledgeBaseId: string | null;
	onClose: () => void;
	onConfirm: (confirmation: KnowledgeImportConfirmation) => void;
}

export function KnowledgeImportDialog({
	draft,
	knowledgeBases,
	activeKnowledgeBaseId,
	onClose,
	onConfirm,
}: KnowledgeImportDialogProps): JSX.Element {
	const initialTargetId =
		draft.targetKnowledgeBaseId ?? (draft.source === "drop" ? activeKnowledgeBaseId : null);
	const [name, setName] = useState(draft.items[0]?.name.replace(/\.[^.]+$/, "") || "新知识库");
	const [description, setDescription] = useState("");
	const [targetId, setTargetId] = useState<string | null>(initialTargetId);
	const nodes = useMemo(() => buildSuggestedTree(draft.items), [draft.items]);
	const creatingNewBase = targetId === null;
	const canSubmit = !creatingNewBase || name.trim().length > 0;

	const confirm = () => {
		onConfirm({
			targetId,
			name: name.trim(),
			description: description.trim() || "由 Vetta 自动整理的知识资料",
			nodes,
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[82vh] overflow-hidden p-0 sm:max-w-[620px]">
				<DialogHeader className="px-5 pt-5">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<span className="icon-[mdi--folder-check-outline] h-5 w-5" />
						</div>
						<div>
							<DialogTitle>确认智能整理方案</DialogTitle>
							<DialogDescription className="mt-1">
								{draft.items.length
									? `已读取 ${draft.items.length} 个项目，以下是建议结构。确认前不会写入知识库。`
									: "可以先创建空知识库，之后再通过拖拽或文件选择器添加资料。"}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				<div className="min-h-0 overflow-y-auto px-5 pb-4">
					{knowledgeBases.length > 0 && (
						<div className="mb-4">
							<label className="mb-1.5 block text-[11px] font-medium text-foreground">保存到</label>
							<select
								value={targetId ?? "__new__"}
								onChange={(event) => setTargetId(event.target.value === "__new__" ? null : event.target.value)}
								className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] text-foreground outline-none focus:border-primary/40"
							>
								<option value="__new__">创建新知识库</option>
								{knowledgeBases.map((base) => (
									<option key={base.id} value={base.id}>
										添加到「{base.name}」
									</option>
								))}
							</select>
						</div>
					)}

					{creatingNewBase && (
						<div className="mb-4 grid grid-cols-2 gap-3">
							<label className="text-[11px] font-medium text-foreground">
								知识库名称
								<input
									value={name}
									onChange={(event) => setName(event.target.value)}
									className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] font-normal outline-none focus:border-primary/40"
								/>
							</label>
							<label className="text-[11px] font-medium text-foreground">
								描述
								<input
									value={description}
									onChange={(event) => setDescription(event.target.value)}
									placeholder="例如：产品与客户资料"
									className="mt-1.5 h-9 w-full rounded-lg border border-border bg-background px-3 text-[12px] font-normal outline-none placeholder:text-muted-foreground/40 focus:border-primary/40"
								/>
							</label>
						</div>
					)}

					<div className="rounded-xl border border-border bg-muted/30">
						<div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
							<div>
								<p className="text-[11px] font-medium text-foreground">建议目录结构</p>
								<p className="mt-0.5 text-[10px] text-muted-foreground/50">
									依据原目录与文件类型生成，建立后仍可继续调整
								</p>
							</div>
							<span className="rounded-full bg-primary/10 px-2 py-0.5 text-[9.5px] font-medium text-primary">
								智能整理
							</span>
						</div>
						<div className="max-h-52 overflow-y-auto p-2">
							{nodes.length > 0 ? (
								nodes.map((node) => (
									<div key={node.id} className="mb-1 last:mb-0">
										<div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[11px]">
											<span className="icon-[mdi--folder-outline] h-4 w-4 text-primary" />
											<span className="flex-1 font-medium text-foreground">{node.name}</span>
											<span className="text-[10px] text-muted-foreground/45">
												{node.children?.length ?? 0}
											</span>
										</div>
										{node.children?.slice(0, 4).map((child) => (
											<div
												key={child.id}
												className="ml-6 flex items-center gap-2 rounded-md px-2 py-1 text-[10.5px] text-muted-foreground"
											>
												<span
													className={cn(
														getFileIcon(child.name, child.type === "directory", false),
														"h-3.5 w-3.5",
													)}
												/>
												<span className="truncate">{child.name}</span>
											</div>
										))}
									</div>
								))
							) : (
								<div className="py-8 text-center text-[11px] text-muted-foreground/50">
									空知识库暂不生成目录
								</div>
							)}
						</div>
					</div>

					<div className="mt-3 flex items-start gap-2 rounded-lg bg-primary/8 px-3 py-2.5">
						<span className="icon-[mdi--shield-check-outline] mt-0.5 h-4 w-4 shrink-0 text-primary" />
						<p className="text-[10.5px] leading-4 text-muted-foreground">
							正式接入后，此步骤会展示去重、重命名、敏感信息与索引计划，并在确认后调用知识库服务。
						</p>
					</div>
				</div>

				<DialogFooter className="mx-0 mb-0 px-5 py-3">
					<Button variant="ghost" onClick={onClose}>
						取消
					</Button>
					<Button variant="primary" disabled={!canSubmit} onClick={confirm}>
						<span className="icon-[mdi--folder-check-outline] h-4 w-4" />
						{targetId ? "添加并整理" : "创建知识库"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
