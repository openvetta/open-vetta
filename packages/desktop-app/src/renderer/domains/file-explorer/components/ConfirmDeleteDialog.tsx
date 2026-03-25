import { useEffect } from "react";
import { motion } from "motion/react";
import type { FsEntry } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";

interface ConfirmDeleteDialogProps {
	entry: FsEntry;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDeleteDialog({ entry, onConfirm, onCancel }: ConfirmDeleteDialogProps): JSX.Element {
	// Close on Escape
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") onCancel();
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [onCancel]);

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
			onClick={onCancel}
			onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
			role="dialog"
			aria-modal="true"
		>
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
				className="w-[280px] rounded-xl border border-[var(--popup-border)] bg-[var(--popup-bg)] p-4"
				style={{ boxShadow: "var(--popup-shadow)" }}
				onClick={(e) => e.stopPropagation()}
			>
				<p className="mb-1 text-[13px] font-semibold text-[var(--text-1)]">
					确认删除
				</p>
				<p className="mb-4 text-[12px] text-[var(--text-2)]">
					确定要删除{entry.isDirectory ? "文件夹" : "文件"}{" "}
					<span className="font-medium text-[var(--text-1)]">{entry.name}</span> 吗？
					{entry.isDirectory && " 此操作将删除文件夹内的所有内容。"}
					此操作无法撤销。
				</p>
				<div className="flex justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onCancel}>
						取消
					</Button>
					<Button variant="destructive" size="sm" onClick={onConfirm}>
						删除
					</Button>
				</div>
			</motion.div>
		</div>
	);
}
