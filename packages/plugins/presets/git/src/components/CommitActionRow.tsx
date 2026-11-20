import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@vetta-org/ui";
import { ChevronIcon, CommitIcon } from "./icons";

export interface CommitActionExtra {
	id: string;
	label: string;
	onSelect: () => void;
	disabled?: boolean;
}

/**
 * 「提交」这一行：一颗实心绿主键 + 紧贴的下拉。
 *
 * 面板与顶栏气泡共用同一个组件，而不是各写一遍同一串 class——两处的按钮必须长得一模一样，
 * 复制粘贴只会在下一次改动时悄悄分叉。主键负责最常做的事（无暂存时连「全部暂存」一起做），
 * 下拉装其余提交方式（提交并推送、修补上次提交……）。
 */
export function CommitActionRow({
	label,
	moreLabel,
	canCommit,
	busy = false,
	disabledReason,
	extras,
	onCommit,
}: {
	/** 主键文案。 */
	label: string;
	/** 下拉键的悬浮提示与无障碍名称。 */
	moreLabel: string;
	canCommit: boolean;
	/** 有操作正在进行：下拉先关掉，避免连点造成两次提交。 */
	busy?: boolean;
	/** 主键不可用的原因，作为悬浮提示。 */
	disabledReason?: string | null;
	extras: readonly CommitActionExtra[];
	onCommit: () => void;
}): JSX.Element {
	// 两半共用同一档绿：禁用时压成同色系的灰绿，而不是换成中性灰——后者会让按钮
	// 断成「一块灰 + 一块绿」两个物件。
	const tone = canCommit ? "bg-[#1f883d] text-white hover:bg-[#1a7f37]" : "bg-[#1f883d]/35 text-white/60";

	return (
		<div className="flex items-stretch overflow-hidden rounded-lg">
			<button
				type="button"
				disabled={!canCommit}
				title={disabledReason ?? undefined}
				onClick={onCommit}
				className={`flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-[12px] font-medium transition-colors ${tone}`}
			>
				<CommitIcon className="h-3.5 w-3.5 shrink-0" />
				<span className="truncate">{label}</span>
			</button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						disabled={busy}
						title={moreLabel}
						aria-label={moreLabel}
						// 分隔线只占八成高度并居中：通高的那条会把按钮视觉上劈成两半。
						className={`relative flex h-8 w-8 shrink-0 items-center justify-center transition-colors before:absolute before:top-[10%] before:left-0 before:h-[80%] before:w-px before:bg-white/15 ${tone}`}
					>
						<ChevronIcon className="h-3.5 w-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" data-vetta-plugin-root="git">
					{extras.map((extra) => (
						<DropdownMenuItem key={extra.id} disabled={extra.disabled} onSelect={extra.onSelect}>
							{extra.label}
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
