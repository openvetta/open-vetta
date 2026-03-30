import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shared/components/ui/dialog";
import { Button } from "@shared/components/ui/button";
import { fetchColleagues, type ColleagueInfo } from "@shared/lib/api";
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
		const projectName = projectDir.split("/").filter(Boolean).pop() ?? projectDir;

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

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="overflow-hidden sm:max-w-md">
				<DialogHeader>
					<DialogTitle>内容流转</DialogTitle>
					<DialogDescription>将选中的文件发送给同事</DialogDescription>
				</DialogHeader>

				{/* 选中的文件 */}
				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<div className="text-xs font-medium text-muted-foreground">
							选中文件 ({selectedFiles.length})
						</div>
						<Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={handleAddFiles}>
							添加文件
						</Button>
					</div>
					<div className="max-h-32 overflow-auto rounded border p-2 text-xs">
						{selectedFiles.length === 0 ? (
							<p className="text-muted-foreground">点击「添加文件」选择要流转的文件</p>
						) : (
							selectedFiles.map((f) => (
								<div key={f} className="group flex min-w-0 items-center gap-1 py-0.5">
									<span className="min-w-0 flex-1 truncate">{f}</span>
									<button
										type="button"
										className="shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
										onClick={() => handleRemoveFile(f)}
									>
										<span className="icon-[mdi--close] text-sm" />
									</button>
								</div>
							))
						)}
					</div>
				</div>

				{/* 选择接收方 */}
				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">选择接收方</div>
					<div className="max-h-40 overflow-y-auto rounded border p-2">
						{colleagues.length === 0 ? (
							<p className="text-xs text-muted-foreground">暂无同组织成员</p>
						) : (
							colleagues.map((c) => (
								<label
									key={c.id}
									className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-muted"
								>
									<input
										type="checkbox"
										checked={selectedReceivers.has(c.id)}
										onChange={() => toggleReceiver(c.id)}
										className="rounded"
									/>
									<span className="text-xs">{c.username}</span>
								</label>
							))
						)}
					</div>
				</div>

				{/* 附加消息 */}
				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">附加消息（可选）</div>
					<textarea
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						placeholder="输入附加消息..."
						className="w-full rounded border bg-background p-2 text-xs outline-none focus:ring-1 focus:ring-ring"
						rows={3}
					/>
				</div>

				{error && <div className="text-xs text-red-500">{error}</div>}

				<DialogFooter>
					<Button variant="outline" onClick={() => setOpen(false)} disabled={sending}>
						取消
					</Button>
					<Button
						onClick={handleSend}
						disabled={sending || selectedReceivers.size === 0 || selectedFiles.length === 0}
					>
						{sending ? "发送中..." : "发送"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
