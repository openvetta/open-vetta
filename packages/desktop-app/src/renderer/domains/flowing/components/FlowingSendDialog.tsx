import { useAtom, useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fetchColleagues, type ColleagueInfo } from "@shared/lib/api";
import { pathBasename } from "@shared/lib/utils";
import {
	activeSessionAtom,
	authTokenAtom,
	flowingSendDialogOpenAtom,
	selectedFilesAtom,
} from "@shared/store/atoms";
import { useFlowingSend } from "../hooks/useFlowingSend";

export function FlowingSendDialog(): JSX.Element {
	const [open, setOpen] = useAtom(flowingSendDialogOpenAtom);
	const token = useAtomValue(authTokenAtom);
	const activeSession = useAtomValue(activeSessionAtom);
	const [selectedFiles, setSelectedFiles] = useAtom(selectedFilesAtom);

	const [colleagues, setColleagues] = useState<ColleagueInfo[]>([]);
	const [selectedReceivers, setSelectedReceivers] = useState<Set<number>>(new Set());
	const [message, setMessage] = useState("");
	const { sending, error, send } = useFlowingSend();

	// 加载同事列表
	useEffect(() => {
		if (open && token) {
			void fetchColleagues(token).then(setColleagues).catch(console.error);
		}
	}, [open, token]);

	const toggleReceiver = useCallback((id: number) => {
		setSelectedReceivers((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

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

	const handleSend = useCallback(async () => {
		if (!activeSession || selectedReceivers.size === 0 || selectedFiles.length === 0) return;

		const projectDir = activeSession.cwd;
		const projectName = pathBasename(projectDir);

		// 读取当前项目的 meta，获取已有的 flowingId（链式流转时复用）
		const meta = await window.vetta.flowing.readMeta(projectDir);
		const existingFlowingId =
			meta?.type === "flowing" && typeof meta.flowingId === "number" ? meta.flowingId : undefined;

		const result = await send({
			projectDir,
			projectName,
			flowingId: existingFlowingId,
			receiverIds: [...selectedReceivers],
			message,
			filePaths: selectedFiles,
		});

		if (result && result.length > 0) {
			// 将服务端返回的 flowingId 写回发送方项目的 meta.json
			const flowingId = result[0].flowing_id;
			await window.vetta.flowing.writeMeta(projectDir, {
				...meta,
				type: "flowing",
				flowingId,
			});

			setOpen(false);
			setSelectedReceivers(new Set());
			setMessage("");
			setSelectedFiles([]);
		}
	}, [activeSession, selectedReceivers, selectedFiles, message, send, setOpen, setSelectedFiles]);

	const canSend = selectedReceivers.size > 0 && selectedFiles.length > 0;

	const selectedReceiverNames = useMemo(() => {
		if (selectedReceivers.size === 0) return "";
		return colleagues
			.filter((c) => selectedReceivers.has(c.id))
			.map((c) => c.username)
			.join(", ");
	}, [colleagues, selectedReceivers]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="overflow-hidden sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<span className="icon-[mdi--send-variant-outline] text-lg text-primary" />
						内容流转
					</DialogTitle>
					<DialogDescription>将选中的文件发送给同事</DialogDescription>
				</DialogHeader>

				{/* 选中的文件 */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<span className="icon-[mdi--file-document-outline] text-sm" />
							文件
							{selectedFiles.length > 0 && (
								<span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.65rem] font-semibold text-primary">
									{selectedFiles.length}
								</span>
							)}
						</div>
						<Button variant="ghost" size="xs" onClick={handleAddFiles}>
							<span className="icon-[mdi--plus]" data-icon="inline-start" />
							添加
						</Button>
					</div>
					<div className="max-h-32 overflow-auto rounded-lg border border-border/50 bg-muted/30 text-xs">
						{selectedFiles.length === 0 ? (
							<button
								type="button"
								onClick={handleAddFiles}
								className="flex w-full items-center justify-center gap-2 p-4 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
							>
								<span className="icon-[mdi--cloud-upload-outline] text-lg" />
								点击选择要流转的文件
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

				{/* 选择接收方 */}
				<div className="space-y-1.5">
					<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<span className="icon-[mdi--account-group-outline] text-sm" />
						接收方
						{selectedReceivers.size > 0 && (
							<span className="rounded-full bg-primary/10 px-1.5 py-px text-[0.65rem] font-semibold text-primary">
								{selectedReceivers.size}
							</span>
						)}
					</div>
					<div className="max-h-40 overflow-y-auto rounded-lg border border-border/50 bg-muted/30">
						{colleagues.length === 0 ? (
							<div className="flex items-center justify-center gap-2 p-4 text-xs text-muted-foreground/50">
								<span className="icon-[mdi--account-off-outline] text-base" />
								暂无同组织成员
							</div>
						) : (
							<div className="p-1">
								{colleagues.map((c) => {
									const isSelected = selectedReceivers.has(c.id);
									return (
										<label
											key={c.id}
											className={`flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 transition-colors ${
												isSelected
													? "bg-primary/8 text-foreground"
													: "text-muted-foreground hover:bg-muted"
											}`}
										>
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => toggleReceiver(c.id)}
												className="sr-only"
											/>
											<span
												className={`flex size-4 shrink-0 items-center justify-center rounded border text-[0.6rem] transition-all ${
													isSelected
														? "border-primary bg-primary text-primary-foreground"
														: "border-border bg-background"
												}`}
											>
												{isSelected && <span className="icon-[mdi--check] text-xs" />}
											</span>
											<span className="flex items-center gap-1.5 text-xs">
												<span
													className={`flex size-5 items-center justify-center rounded-full text-[0.6rem] font-medium ${
														isSelected
															? "bg-primary/15 text-primary"
															: "bg-muted text-muted-foreground"
													}`}
												>
													{c.username.charAt(0).toUpperCase()}
												</span>
												{c.username}
											</span>
										</label>
									);
								})}
							</div>
						)}
					</div>
				</div>

				{/* 附加消息 */}
				<div className="space-y-1.5">
					<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
						<span className="icon-[mdi--message-text-outline] text-sm" />
						附加消息
						<span className="font-normal text-muted-foreground/50">可选</span>
					</div>
					<Textarea
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="输入附加消息..."
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
					{canSend && (
						<div className="mr-auto hidden items-center text-xs text-muted-foreground sm:flex">
							{selectedFiles.length} 个文件 → {selectedReceiverNames}
						</div>
					)}
					<Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
						取消
					</Button>
					<Button onClick={handleSend} disabled={sending || !canSend}>
						{sending ? (
							<>
								<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
								发送中
							</>
						) : (
							<>
								<span className="icon-[mdi--send] text-xs" data-icon="inline-start" />
								发送
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
