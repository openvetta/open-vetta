import { useMemo, useState } from "react";
import type {
	KnowledgeImportDraft,
	KnowledgeNode,
} from "@shared/types/knowledge-base";
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
import { buildSuggestedTree } from "../lib/knowledge-base";

export interface KnowledgeImportConfirmation {
	targetId: string | null;
	name: string;
	description: string;
	nodes: KnowledgeNode[];
}

interface KnowledgeImportDialogProps {
	draft: KnowledgeImportDraft;
	activeKnowledgeBaseId: string | null;
	onClose: () => void;
	onConfirm: (confirmation: KnowledgeImportConfirmation) => void;
}

export function KnowledgeImportDialog({
	draft,
	activeKnowledgeBaseId,
	onClose,
	onConfirm,
}: KnowledgeImportDialogProps): JSX.Element {
	const initialTargetId =
		draft.targetKnowledgeBaseId ?? (draft.source === "drop" ? activeKnowledgeBaseId : null);
	const [name, setName] = useState(draft.items[0]?.name.replace(/\.[^.]+$/, "") || "新知识库");
	const [description, setDescription] = useState("");
	const nodes = useMemo(() => buildSuggestedTree(draft.items), [draft.items]);
	const creatingNewBase = initialTargetId === null;
	const canSubmit = !creatingNewBase || name.trim().length > 0;

	const confirm = () => {
		onConfirm({
			targetId: initialTargetId,
			name: name.trim(),
			description: description.trim(),
			nodes,
		});
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-[480px]">
				<DialogHeader>
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
							<span className="icon-[mdi--folder-check-outline] h-5 w-5" />
						</div>
						<div>
							<DialogTitle>{creatingNewBase ? "创建知识库" : "添加资料"}</DialogTitle>
							<DialogDescription className="mt-1">
								{draft.items.length
									? `已选择 ${draft.items.length} 个项目，确认后将在后台完成导入和整理。`
									: "填写名称即可创建，之后可随时添加文件或文件夹。"}
							</DialogDescription>
						</div>
					</div>
				</DialogHeader>

				{creatingNewBase && (
					<div className="grid gap-3">
						<label
							htmlFor="knowledge-base-name"
							className="text-[11px] font-medium text-foreground"
						>
							知识库名称
							<Input
								id="knowledge-base-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								className="mt-1.5 h-9 bg-background text-[12px] font-normal"
								autoFocus
							/>
						</label>
						<label
							htmlFor="knowledge-base-description"
							className="text-[11px] font-medium text-foreground"
						>
							描述
							<span className="ml-1 font-normal text-muted-foreground/50">可选</span>
							<Input
								id="knowledge-base-description"
								value={description}
								onChange={(event) => setDescription(event.target.value)}
								placeholder="例如：产品与客户资料"
								className="mt-1.5 h-9 bg-background text-[12px] font-normal placeholder:text-muted-foreground/40"
							/>
						</label>
					</div>
				)}

				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						取消
					</Button>
					<Button variant="primary" disabled={!canSubmit} onClick={confirm}>
						<span className="icon-[mdi--folder-check-outline] h-4 w-4" />
						{creatingNewBase ? "创建知识库" : "开始导入"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
