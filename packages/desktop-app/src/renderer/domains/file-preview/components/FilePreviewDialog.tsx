import { filePreviewContextReadonlyAtom } from "@shared/store/atoms";
import { useAtom } from "jotai";
import { AnimatePresence, motion } from "motion/react";
import { FilePreviewView, usePreviewNav } from "./FilePreviewView";

/**
 * 全局文件预览弹层（图片附件等非文件树入口使用）。
 * 文件树点击文件走 inline 内嵌预览，请使用 inlineFilePreviewAtom。
 */
export function FilePreviewDialog(): JSX.Element {
	const [ctx, setCtx] = useAtom(filePreviewContextReadonlyAtom);
	const { goPrev, goNext, close } = usePreviewNav(setCtx);
	const open = ctx !== null;

	return (
		<AnimatePresence>
			{open && ctx && (
				<div className="fixed inset-0 z-50 flex items-end justify-center">
					<motion.div
						className="absolute inset-0 bg-black/20 supports-backdrop-filter:backdrop-blur-[2px]"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.18, ease: "easeOut" }}
						onClick={close}
					/>
					<motion.div
						role="dialog"
						aria-modal="true"
						className="relative flex h-[90vh] w-[60vw] flex-col overflow-hidden rounded-t-[20px] border-[6px] border-b-0 border-border/30 bg-background/95 shadow-[0_-12px_48px_-12px_rgba(15,23,42,0.25)] backdrop-blur-xl"
						initial={{ y: "100%", opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: "100%", opacity: 0 }}
						transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.9 }}
					>
						<FilePreviewView
							ctx={ctx}
							onPrev={goPrev}
							onNext={goNext}
							onClose={close}
							canPrev={ctx.index > 0}
							canNext={ctx.index < ctx.items.length - 1}
							enableKeyboard
						/>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
