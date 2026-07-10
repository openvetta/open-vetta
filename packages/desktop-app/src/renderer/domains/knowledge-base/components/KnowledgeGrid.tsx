import { useTranslation } from "react-i18next";
import { getColoredFileIcon } from "@domains/file-explorer/components/fileIcons";
import { cn } from "@shared/lib/utils";
import { useMarqueeSelection } from "../hooks/useMarqueeSelection";
import { knowledgeDirItemCount } from "../lib/knowledge-base";
import { KnowledgeEmptyState, type KnowledgeViewProps, StatusBadge } from "./KnowledgeViewShared";

/**
 * Mac Finder 风格文件宫格：当前层级平铺，左右两端与页头对齐（容器无横向内边距）。
 * 单击选中（支持 cmd/ctrl、shift 多选），拖拽空白处框选，双击打开，右键弹菜单。
 * 选中态：图标区淡色底 + 文件名按行贴合宽度的蓝色圆角块（阶梯形）。
 */
export function KnowledgeGrid({
	nodes,
	searching,
	selectedIds,
	statusFor,
	onItemClick,
	onOpen,
	onContextMenu,
	onSelectIds,
	onClearSelection,
}: KnowledgeViewProps): JSX.Element {
	const { t } = useTranslation("settings");
	const { scrollRef, marquee, onMouseDown } = useMarqueeSelection({
		selectedIds,
		onSelectIds,
		onClearSelection,
	});

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: 鼠标框选交互，键盘可用 Esc/方向键
		<div
			ref={scrollRef}
			className="relative min-h-0 flex-1 overflow-y-auto"
			onMouseDown={onMouseDown}
		>
			{nodes.length === 0 ? (
				<KnowledgeEmptyState searching={searching} />
			) : (
				<div className="relative min-h-full">
					<div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1 py-3">
						{nodes.map((node) => {
							const isDir = node.type === "directory";
							const selected = selectedIds.has(node.id);
							const status = statusFor(node);
							const unprocessed = status === "unprocessed";
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
											"relative flex h-[72px] w-[72px] items-center justify-center rounded-2xl transition-colors",
											selected ? "bg-foreground/10" : "group-hover/cell:bg-foreground/[0.04]",
										)}
									>
										{/* 未加工：图标去色淡化，提示尚未被索引 */}
										<span
											className={cn(
												getColoredFileIcon(node.name, isDir),
												"h-14 w-14 shrink-0",
												unprocessed && "opacity-40 grayscale",
											)}
										/>
										{status && status !== "processed" && <StatusBadge status={status} />}
									</span>
									{/* Mac 风格：选中时每行文字各带贴合宽度的圆角块（box-decoration clone 形成阶梯形）；始终限制两行，避免选中时撑开导致宫格跳动 */}
									<span className="line-clamp-2 w-full text-center text-[12px] leading-[1.55]">
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
											{t("kbItemCount", { n: knowledgeDirItemCount(node) })}
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
