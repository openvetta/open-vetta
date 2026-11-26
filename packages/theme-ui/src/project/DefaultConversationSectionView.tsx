import { cn } from "@vetta-org/ui/utils";
import type { JSX, ReactNode } from "react";
import { SidebarSectionActionButton } from "../sidebar/SidebarSectionActionButton";

export interface DefaultConversationSectionViewLabels {
	more: string;
	newSession: string;
}

export interface DefaultConversationSectionViewProps {
	className?: string;
	filterSelect: ReactNode;
	labels: DefaultConversationSectionViewLabels;
	list: ReactNode;
	onMoreClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
	onNewSession?: () => void;
	onOpenContextMenu: (event: React.MouseEvent) => void;
	showNewSession: boolean;
}

/**
 * 该区块不再自带滚动容器：项目区与对话区共用侧栏面板的同一个滚动区。
 * 标题行右侧的操作只在悬停标题行时出现；列表为空时由项目区的引导卡片承担「开始新对话」。
 */
export function DefaultConversationSectionView({
	className,
	filterSelect,
	labels,
	list,
	onMoreClick,
	onNewSession,
	onOpenContextMenu,
	showNewSession,
}: DefaultConversationSectionViewProps): JSX.Element {
	return (
		<div className={cn("flex flex-col", className)}>
			<div
				className="group -mx-1.5 flex shrink-0 items-center justify-between pb-1 pl-1.5 pr-2.5 pt-1"
				onContextMenu={onOpenContextMenu}
			>
				<div className="flex min-w-0 items-center gap-0.5">{filterSelect}</div>
				<div className="flex items-center">
					<SidebarSectionActionButton
						iconClassName="icon-[solar--menu-dots-bold]"
						label={labels.more}
						onClick={onMoreClick}
					/>
					{showNewSession && onNewSession && (
						<SidebarSectionActionButton
							iconClassName="icon-[solar--add-linear]"
							label={labels.newSession}
							onClick={onNewSession}
						/>
					)}
				</div>
			</div>
			{list}
		</div>
	);
}
