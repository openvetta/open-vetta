import { motion } from "motion/react";
import type { KnowledgeNode, KnowledgeProcessStatus } from "@shared/types/knowledge-base";
import { cn } from "@shared/lib/utils";

/** 宫格 / 列表两种文件视图共用的交互契约。 */
export interface KnowledgeViewProps {
	/** 当前层级、已按搜索过滤的有序子节点。 */
	nodes: KnowledgeNode[];
	searching: boolean;
	selectedIds: Set<string>;
	/** 文件加工态（目录返回 null，不标记）。用于灰显与角标。 */
	statusFor: (node: KnowledgeNode) => KnowledgeProcessStatus | null;
	/** 单击：按修饰键做单选 / cmd 切换 / shift 区间选。 */
	onItemClick: (node: KnowledgeNode, event: React.MouseEvent) => void;
	/** 双击：打开（目录进入 / 文件走右侧内嵌预览）。 */
	onOpen: (node: KnowledgeNode) => void;
	/** 右键：弹出菜单。 */
	onContextMenu: (node: KnowledgeNode, event: React.MouseEvent) => void;
	/** 框选：用最新的选中集合覆盖。 */
	onSelectIds: (ids: Set<string>) => void;
	/** 点击空白：清空选中。 */
	onClearSelection: () => void;
}

/** 文件大小：B / KB / MB / GB。目录无大小返回空串。 */
export function formatFileSize(bytes: number | undefined): string {
	if (bytes === undefined) return "";
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = units[0];
	for (let i = 1; i < units.length && value >= 1024; i++) {
		value /= 1024;
		unit = units[i];
	}
	return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

/** 文件加工态角标：未加工（待处理）/ 待更新（源已改）。已加工不显示。 */
export function StatusBadge({ status }: { status: KnowledgeProcessStatus }): JSX.Element {
	const config =
		status === "stale"
			? { icon: "icon-[mdi--sync-alert]", title: "源文件已更新，待重新加工", tone: "bg-amber-500 text-white" }
			: { icon: "icon-[mdi--timer-sand]", title: "未加工", tone: "bg-muted-foreground/70 text-white" };
	return (
		<span
			title={config.title}
			className={cn(
				"absolute right-0 bottom-0 flex h-4 w-4 items-center justify-center rounded-full shadow-sm ring-2 ring-background",
				config.tone,
			)}
		>
			<span className={cn(config.icon, "h-2.5 w-2.5")} />
		</span>
	);
}

const EMPTY_EASE = [0.22, 1, 0.36, 1] as const;

/** 目录为空 / 搜索无结果时的占位态：柔和图标圆盘 + 文案。 */
export function KnowledgeEmptyState({ searching }: { searching: boolean }): JSX.Element {
	return (
		<div className="flex h-full items-center justify-center px-8 py-10">
			<motion.div
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.4, ease: EMPTY_EASE }}
				className="flex max-w-xs flex-col items-center text-center"
			>
				<div className="relative mb-5 flex h-16 w-16 items-center justify-center">
					<span className="absolute inset-0 rounded-3xl bg-muted/40" />
					<span className="absolute inset-1.5 rounded-2xl bg-background/60 ring-1 ring-inset ring-border/50" />
					<span
						className={cn(
							"relative h-7 w-7 text-muted-foreground/40",
							searching ? "icon-[mdi--magnify]" : "icon-[mdi--folder-open-outline]",
						)}
					/>
				</div>
				<p className="text-[13px] font-medium text-foreground/80">
					{searching ? "没有匹配的文件" : "这个目录是空的"}
				</p>
				<p className="mt-1.5 text-[11px] leading-5 text-muted-foreground/50">
					{searching ? "换个关键词，或清空搜索查看全部内容" : "拖入文件或文件夹，新增内容会自动整理归类"}
				</p>
			</motion.div>
		</div>
	);
}
