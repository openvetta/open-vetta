import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@shared/components/ui/dialog";
import type { FlowUserNode, TransferDetail } from "./types";

function formatTime(dateStr: string) {
	return new Date(dateStr).toLocaleDateString("zh-CN", {
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function statusLabel(status: string) {
	switch (status) {
		case "pending":
			return "待处理";
		case "accepted":
			return "已接受";
		case "rejected":
			return "已拒绝";
		default:
			return status;
	}
}

function statusBadgeClass(status: string) {
	switch (status) {
		case "accepted":
			return "border-teal-500/40 bg-teal-500/10 text-teal-300";
		case "rejected":
			return "border-red-500/40 bg-red-500/10 text-red-300";
		default:
			return "border-border bg-muted/30 text-muted-foreground";
	}
}

function fileName(path: string): string {
	return path.split("/").pop() ?? path;
}

type NodeDetailDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	node: FlowUserNode | null;
};

export function NodeDetailDialog({ open, onOpenChange, node }: NodeDetailDialogProps) {
	if (!node) return null;

	const sorted = [...node.transfers].sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="overflow-hidden sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-sm">
						{node.userAvatar ? (
							<img src={node.userAvatar} alt={node.userName} className="h-5 w-5 rounded-full" />
						) : (
							<div className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[8px]">
								{node.userName.slice(0, 2)}
							</div>
						)}
						{node.userName} - 流转详情
					</DialogTitle>
				</DialogHeader>

				<div className="max-h-[50vh] space-y-2 overflow-auto">
					{/* 环节完成成果文件 */}
					{node.completionFiles.length > 0 && (
						<div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
							<div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
								<span className="icon-[mdi--check-circle-outline] text-sm" />
								环节完成成果
							</div>
							{node.completionMessage && (
								<div className="rounded bg-muted/30 px-2 py-1 text-xs text-foreground/80">
									{node.completionMessage}
								</div>
							)}
							<div className="space-y-px pl-3">
								{node.completionFiles.map((f) => (
									<div
										key={f}
										className="flex items-center gap-1 text-[10px] text-muted-foreground/70"
									>
										<span className="icon-[mdi--file-document-outline] shrink-0 text-xs" />
										<span className="truncate">{fileName(f)}</span>
									</div>
								))}
							</div>
						</div>
					)}

					{sorted.length === 0 && node.completionFiles.length === 0 ? (
						<p className="py-4 text-center text-xs text-muted-foreground/50">暂无流转记录</p>
					) : (
						sorted.map((t) => <TransferCard key={t.transferId} detail={t} />)
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}

function TransferCard({ detail: t }: { detail: TransferDetail }) {
	return (
		<div className="space-y-1.5 rounded-lg border border-border/50 bg-card/50 p-2.5">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-1.5 text-xs">
					{t.direction === "in" ? (
						<span className="icon-[mdi--arrow-left] text-sm text-blue-400" />
					) : (
						<span className="icon-[mdi--arrow-right] text-sm text-orange-400" />
					)}
					<span className="font-medium">
						{t.direction === "in" ? "收到" : "发出"} {t.counterpartName}
					</span>
				</div>
				<span className={`rounded border px-1 text-[9px] ${statusBadgeClass(t.status)}`}>
					{statusLabel(t.status)}
				</span>
			</div>

			{/* Time */}
			<div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
				<span className="icon-[mdi--clock-outline] text-xs" />
				{formatTime(t.createdAt)}
				{t.respondedAt && <span> → {formatTime(t.respondedAt)}</span>}
			</div>

			{/* Message */}
			{t.message && (
				<div className="rounded bg-muted/30 px-2 py-1 text-xs text-foreground/80">{t.message}</div>
			)}

			{/* Files */}
			{t.fileList.length > 0 && (
				<div className="space-y-0.5">
					<div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
						<span className="icon-[mdi--file-outline] text-xs" />
						{t.fileList.length} 个文件
					</div>
					<div className="space-y-px pl-3">
						{t.fileList.map((f) => (
							<div
								key={f}
								className="flex items-center gap-1 text-[10px] text-muted-foreground/70"
							>
								<span className="icon-[mdi--file-document-outline] shrink-0 text-xs" />
								<span className="truncate">{fileName(f)}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
