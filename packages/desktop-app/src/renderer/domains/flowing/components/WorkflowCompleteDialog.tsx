import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Button } from "@shared/components/ui/button";
import { Textarea } from "@shared/components/ui/textarea";
import { completeWorkflowStage } from "@shared/lib/api";
import { pathBasename } from "@shared/lib/utils";
import {
	activeSessionAtom,
	authTokenAtom,
	selectedFilesAtom,
	workflowInstanceAtom,
} from "@shared/store/atoms";
import { authUserAtom } from "@shared/store/auth-atoms";
import { workflowCompleteDialogOpenAtom } from "@shared/store/flowing-atoms";
import { useFlowingSend } from "../hooks/useFlowingSend";

export function WorkflowCompleteDialog(): JSX.Element {
	const [open, setOpen] = useAtom(workflowCompleteDialogOpenAtom);
	const token = useAtomValue(authTokenAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [selectedFiles, setSelectedFiles] = useAtom(selectedFilesAtom);
	const workflowInstance = useAtomValue(workflowInstanceAtom);
	const setWorkflowInstance = useSetAtom(workflowInstanceAtom);

	const user = useAtomValue(authUserAtom);
	const { send } = useFlowingSend();

	const [message, setMessage] = useState("");
	const [completing, setCompleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleAddFiles = useCallback(async () => {
		const defaultPath = activeSession?.cwd;
		const files = await window.vetta.dialog.selectFiles(defaultPath);
		if (files.length > 0) {
			setSelectedFiles((prev) => {
				const existing = new Set(prev);
				const merged = [...prev];
				for (const f of files) {
					if (!existing.has(f)) merged.push(f);
				}
				return merged;
			});
		}
	}, [activeSession, setSelectedFiles]);

	const handleRemoveFile = useCallback(
		(filePath: string) => {
			setSelectedFiles((prev) => prev.filter((f) => f !== filePath));
		},
		[setSelectedFiles],
	);

	const handleComplete = useCallback(async () => {
		if (!workflowInstance || !token || !user || !activeSession) return;

		setCompleting(true);
		setError(null);
		try {
			const projectDir = activeSession.cwd;
			const projectName = pathBasename(projectDir);

			// 如果有选择文件，先发送 transfer 记录保存最终成果
			// 必须在 completeWorkflowStage 之前，因为完成后工作流状态变为 completed，send 会失败
			if (selectedFiles.length > 0) {
				const result = await send({
					projectDir,
					projectName,
					flowingId: workflowInstance.flowing_id,
					receiverIds: [user.id],
					message: message || "最终环节完成",
					filePaths: selectedFiles,
				});
				if (!result) {
					setError("上传最终成果文件失败");
					return;
				}
			}

			await completeWorkflowStage(token, workflowInstance.id);

			// 更新本地工作流实例状态为 completed
			setWorkflowInstance({
				...workflowInstance,
				status: "completed",
			});

			setOpen(false);
			setSelectedFiles([]);
			setMessage("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "完成工作流失败");
		} finally {
			setCompleting(false);
		}
	}, [workflowInstance, token, user, activeSession, selectedFiles, message, setOpen, setSelectedFiles, setWorkflowInstance, send]);

	const currentStageName = workflowInstance
		? workflowInstance.stages[workflowInstance.current_stage]?.name ?? ""
		: "";

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="overflow-hidden sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="icon-[mdi--check-circle-outline] text-lg text-emerald-500" />
						完成工作流
					</DialogTitle>
					<DialogDescription>
						当前为最终环节「{currentStageName}」，确认完成后工作流将结束
					</DialogDescription>
				</DialogHeader>

				{/* 最终文件 */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<span className="icon-[mdi--file-check-outline] text-sm" />
							最终成果文件
							{selectedFiles.length > 0 && (
								<span className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[0.65rem] font-semibold text-emerald-500">
									{selectedFiles.length}
								</span>
							)}
						</div>
						<Button variant="ghost" size="xs" onClick={handleAddFiles}>
							<span className="icon-[mdi--plus]" data-icon="inline-start" />
							添加
						</Button>
					</div>
					<div className="max-h-40 overflow-auto rounded-lg border border-border/50 bg-muted/30 text-xs">
						{selectedFiles.length === 0 ? (
							<button
								type="button"
								onClick={handleAddFiles}
								className="flex w-full items-center justify-center gap-2 p-4 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
							>
								<span className="icon-[mdi--cloud-upload-outline] text-lg" />
								选择最终成果文件（可选）
							</button>
						) : (
							<div className="divide-y divide-border/30">
								{selectedFiles.map((f) => (
									<div key={f} className="group flex min-w-0 items-center gap-2 px-2.5 py-1.5">
										<span className="icon-[mdi--file-outline] shrink-0 text-sm text-muted-foreground/50" />
										<div className="min-w-0 flex-1">
											<div className="truncate font-medium">{pathBasename(f)}</div>
										</div>
										<button
											type="button"
											className="shrink-0 rounded-md p-0.5 text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
											onClick={() => handleRemoveFile(f)}
										>
											<span className="icon-[mdi--close] text-sm" />
										</button>
									</div>
								))}
							</div>
						)}
					</div>
				</div>

				{/* 备注 */}
				<div className="space-y-1.5">
					<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<span className="icon-[mdi--message-text-outline] text-sm" />
						完成备注
						<span className="font-normal text-muted-foreground/50">可选</span>
					</div>
					<Textarea
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="输入完成备注..."
						className="min-h-[4.5rem] resize-none text-xs"
					/>
				</div>

				{error && (
					<div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
						<span className="icon-[mdi--alert-circle-outline] shrink-0 text-sm" />
						{error}
					</div>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={completing}>
						取消
					</Button>
					<Button
						onClick={handleComplete}
						disabled={completing}
						className="bg-emerald-600 hover:bg-emerald-700"
					>
						{completing ? (
							<>
								<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
								处理中
							</>
						) : (
							<>
								<span className="icon-[mdi--check] text-xs" data-icon="inline-start" />
								确认完成
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
