import { useState } from "react";
import type { KnowledgeBase, KnowledgeImportDraft } from "@shared/types/knowledge-base";
import { Button } from "@shared/components/ui/button";
import { Input } from "@shared/components/ui/input";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { cn } from "@shared/lib/utils";

export interface KnowledgeImportConfirmation {
	/** 选中已有库则为其 id；新建库则 null（用 name 创建）。 */
	targetId: string | null;
	name: string;
	sourcePaths: string[];
}

const NEW_BASE = "__new__";

interface KnowledgeImportDialogProps {
	draft: KnowledgeImportDraft;
	activeKnowledgeBaseId: string | null;
	knowledgeBases: KnowledgeBase[];
	onClose: () => void;
	onConfirm: (confirmation: KnowledgeImportConfirmation) => void;
}

export function KnowledgeImportDialog({
	draft,
	activeKnowledgeBaseId,
	knowledgeBases,
	onClose,
	onConfirm,
}: KnowledgeImportDialogProps): JSX.Element {
	const createOnly = draft.createOnly ?? false;
	const initialTarget = createOnly
		? NEW_BASE
		: (draft.defaultTargetId ?? activeKnowledgeBaseId ?? knowledgeBases[0]?.id ?? NEW_BASE);
	const [target, setTarget] = useState(initialTarget);
	const [name, setName] = useState("新知识库");

	const creatingNew = target === NEW_BASE;
	const validName = name.trim().length > 0 && !/[\\/]/.test(name.trim());
	const canSubmit = creatingNew ? validName : true;

	const confirm = () => {
		onConfirm({
			targetId: creatingNew ? null : target,
			name: name.trim(),
			sourcePaths: draft.sourcePaths,
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[460px]">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<span className="icon-[mdi--folder-plus-outline] h-5 w-5" />
						</div>
						<div>
							<DialogTitle>{createOnly ? "创建知识库" : "添加资料"}</DialogTitle>
							<DialogDescription className="mt-1">
								{createOnly
									? "填写名称即可创建，之后可随时拖入文件。"
									: `已选择 ${draft.sourcePaths.length} 个项目，确认后平铺加入所选知识库。`}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{!createOnly && knowledgeBases.length > 0 && (
					<div className="grid gap-1.5">
						<span className="text-[11px] font-medium text-foreground">加入到</span>
						<div className="max-h-44 overflow-y-auto rounded-lg border border-border/60 p-1">
							{knowledgeBases.map((base) => (
								<button
									key={base.id}
									type="button"
									onClick={() => setTarget(base.id)}
									className={cn(
										"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
										target === base.id ? "bg-primary/10 text-foreground" : "hover:bg-accent",
									)}
								>
									<span className="icon-[mdi--book-outline] h-4 w-4 text-muted-foreground" />
									<span className="min-w-0 flex-1 truncate">{base.name}</span>
									{target === base.id && <span className="icon-[mdi--check] h-4 w-4 text-primary" />}
								</button>
							))}
							<button
								type="button"
								onClick={() => setTarget(NEW_BASE)}
								className={cn(
									"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] font-medium transition-colors",
									creatingNew ? "bg-primary/10 text-primary" : "text-primary hover:bg-primary/10",
								)}
							>
								<span className="icon-[mdi--plus] h-4 w-4" />
								新建知识库
							</button>
						</div>
					</div>
				)}

				{creatingNew && (
					<label htmlFor="knowledge-base-name" className="text-[11px] font-medium text-foreground">
						知识库名称
						<Input
							id="knowledge-base-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="mt-1.5 h-9 bg-background text-[12px] font-normal"
							autoFocus
						/>
					</label>
				)}

				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						取消
					</Button>
					<Button variant="primary" disabled={!canSubmit} onClick={confirm}>
						<span className="icon-[mdi--folder-check-outline] h-4 w-4" />
						{createOnly ? "创建" : "开始导入"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
