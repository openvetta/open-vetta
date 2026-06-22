import { motion } from "motion/react";
import { Button } from "@shared/components/ui/button";
import { KnowledgeSourcePicker } from "./KnowledgeSourcePicker";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface KnowledgeBaseEmptyStateProps {
	onCreate: () => void;
	onPickFiles: () => void;
	onPickFolders: () => void;
}

export function KnowledgeBaseEmptyState({
	onCreate,
	onPickFiles,
	onPickFolders,
}: KnowledgeBaseEmptyStateProps): JSX.Element {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.45, ease: EASE_OUT }}
			className="mx-8 mb-8 flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20"
		>
			<div className="flex max-w-md flex-col items-center px-8 text-center">
				<div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
					<span className="icon-[mdi--bookshelf] h-9 w-9" />
				</div>
				<h2 className="text-[18px] font-semibold text-foreground">建立你的第一个知识库</h2>
				<p className="mt-2 text-[12px] leading-5 text-muted-foreground/65">
					从文件或目录开始。Vetta 会先分析内容并提出目录建议，确认后才执行整理。
				</p>
				<div className="mt-6 flex items-center gap-2">
					<Button variant="primary" onClick={onCreate}>
						<span className="icon-[mdi--plus] h-4 w-4" />
						创建知识库
					</Button>
					<KnowledgeSourcePicker onPickFiles={onPickFiles} onPickFolders={onPickFolders} />
				</div>
				<p className="mt-5 text-[11px] text-muted-foreground/45">也可以直接把文件拖到此窗口任意位置</p>
			</div>
		</motion.div>
	);
}
