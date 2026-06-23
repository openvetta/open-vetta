import { useCallback, useRef, useState } from "react";
import { motion } from "motion/react";
import type { KnowledgeNode } from "@shared/types/knowledge-base";
import { getColoredFileIcon } from "@domains/file-explorer/components/fileIcons";
import { cn } from "@shared/lib/utils";

interface KnowledgeGridProps {
	/** 当前层级、已按搜索过滤的有序子节点。 */
	nodes: KnowledgeNode[];
	searching: boolean;
	selectedIds: Set<string>;
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

interface MarqueeRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

const DRAG_THRESHOLD = 4;

/**
 * Mac Finder 风格文件宫格：当前层级平铺，左右两端与页头对齐（容器无横向内边距）。
 * 单击选中（支持 cmd/ctrl、shift 多选），拖拽空白处框选，双击打开，右键弹菜单。
 * 选中态：图标区淡色底 + 文件名按行贴合宽度的蓝色圆角块（阶梯形）。
 */
export function KnowledgeGrid({
	nodes,
	searching,
	selectedIds,
	onItemClick,
	onOpen,
	onContextMenu,
	onSelectIds,
	onClearSelection,
}: KnowledgeGridProps): JSX.Element {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [marquee, setMarquee] = useState<MarqueeRect | null>(null);

	// 框选：在空白处按下并拖动，实时计算与子项的相交集合。
	const onMouseDown = useCallback(
		(event: React.MouseEvent) => {
			if (event.button !== 0) return;
			const target = event.target as HTMLElement;
			// 点在某个 item 上时不触发框选，交给该 item 的 click 处理。
			if (target.closest("[data-knode]")) return;
			const container = scrollRef.current;
			if (!container) return;

			const cr = container.getBoundingClientRect();
			const toContent = (clientX: number, clientY: number) => ({
				x: clientX - cr.left + container.scrollLeft,
				y: clientY - cr.top + container.scrollTop,
			});
			const start = toContent(event.clientX, event.clientY);
			const additive = event.metaKey || event.ctrlKey || event.shiftKey;
			const base = additive ? new Set(selectedIds) : new Set<string>();
			if (!additive) onClearSelection();

			let moved = false;

			const onMove = (e: MouseEvent) => {
				const cur = toContent(e.clientX, e.clientY);
				const left = Math.min(start.x, cur.x);
				const top = Math.min(start.y, cur.y);
				const width = Math.abs(cur.x - start.x);
				const height = Math.abs(cur.y - start.y);
				if (!moved && width < DRAG_THRESHOLD && height < DRAG_THRESHOLD) return;
				moved = true;
				setMarquee({ left, top, width, height });

				const next = new Set(base);
				const right = left + width;
				const bottom = top + height;
				for (const el of container.querySelectorAll<HTMLElement>("[data-knode-id]")) {
					const ir = el.getBoundingClientRect();
					const ix = ir.left - cr.left + container.scrollLeft;
					const iy = ir.top - cr.top + container.scrollTop;
					const intersects = ix < right && ix + ir.width > left && iy < bottom && iy + ir.height > top;
					if (intersects) {
						const id = el.dataset.knodeId;
						if (id) next.add(id);
					}
				}
				onSelectIds(next);
			};

			const onUp = () => {
				window.removeEventListener("mousemove", onMove);
				window.removeEventListener("mouseup", onUp);
				setMarquee(null);
			};

			window.addEventListener("mousemove", onMove);
			window.addEventListener("mouseup", onUp);
		},
		[selectedIds, onSelectIds, onClearSelection],
	);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 鼠标框选交互，键盘可用 Esc/方向键
		<div
			ref={scrollRef}
			className="relative min-h-0 flex-1 overflow-y-auto"
			onMouseDown={onMouseDown}
		>
			{nodes.length === 0 ? (
				<GridEmptyState searching={searching} />
			) : (
				<div className="relative min-h-full">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1 py-3">
						{nodes.map((node) => {
							const isDir = node.type === "directory";
							const selected = selectedIds.has(node.id);
							return (
								<button
									key={node.id}
									type="button"
									data-knode
									data-knode-id={node.id}
									onClick={(e) => onItemClick(node, e)}
									onDoubleClick={() => onOpen(node)}
									onContextMenu={(e) => {
										e.preventDefault();
										onContextMenu(node, e);
									}}
									className="group/cell flex w-full flex-col items-center gap-1.5 rounded-lg px-2 py-3"
								>
									{/* 多色品牌图标，配色内置，勿加 text-* 颜色类 */}
									<span
										className={cn(
											"flex h-[72px] w-[72px] items-center justify-center rounded-2xl transition-colors",
											selected ? "bg-foreground/10" : "group-hover/cell:bg-foreground/[0.04]",
										)}
									>
										<span className={cn(getColoredFileIcon(node.name, isDir), "h-14 w-14 shrink-0")} />
									</span>
									{/* Mac 风格：选中时每行文字各带贴合宽度的圆角块（box-decoration clone 形成阶梯形） */}
									<span
										className={cn(
											"w-full text-center text-[12px] leading-[1.55]",
											selected ? "block" : "line-clamp-2",
										)}
									>
										<span
											className={cn(
												"break-all [-webkit-box-decoration-break:clone] [box-decoration-break:clone]",
												selected
													? "rounded bg-primary px-1.5 py-0.5 text-primary-foreground"
													: "text-foreground",
											)}
										>
											{node.name}
										</span>
									</span>
									{isDir && (
										<span className="text-[10px] tabular-nums text-muted-foreground/45">
											{node.children?.length ?? 0} 项
										</span>
									)}
								</button>
							);
						})}
					</div>
					{marquee && (
						<div
							className="pointer-events-none absolute z-10 rounded-sm border border-primary/50 bg-primary/10"
							style={{
								left: marquee.left,
								top: marquee.top,
								width: marquee.width,
								height: marquee.height,
							}}
						/>
					)}
				</div>
			)}
		</div>
	);
}

const EMPTY_EASE = [0.22, 1, 0.36, 1] as const;

/** 目录为空 / 搜索无结果时的占位态：柔和图标圆盘 + 文案。 */
function GridEmptyState({ searching }: { searching: boolean }): JSX.Element {
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
