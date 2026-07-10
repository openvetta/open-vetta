import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { DefaultConversationFilter, Project, SessionInfo } from "@shared/store/atoms";
import { projectContextMenuAtom } from "@shared/store/atoms";
import { cn } from "@shared/lib/utils";
import { DefaultConversationFilterSelect } from "../../filters/SidebarFilterSelect";
import { DefaultSessionList } from "./DefaultSessionList";

interface DefaultConversationSectionProps {
	activeSessionPath: string;
	className?: string;
	defaultConversationFilter: DefaultConversationFilter;
	listClassName?: string;
	onNewSession: (cwd: string) => void;
	onRenameSession: (cwd: string, sessionPath: string, name: string) => void;
	onSelectSession: (cwd: string, sessionPath: string) => void;
	project: Project;
	sessions: SessionInfo[];
}

export function DefaultConversationSection({
	activeSessionPath,
	className,
	defaultConversationFilter,
	listClassName,
	onNewSession,
	onRenameSession,
	onSelectSession,
	project,
	sessions,
}: DefaultConversationSectionProps): JSX.Element {
	const { t } = useTranslation("project");
	const [, setProjectMenu] = useAtom(projectContextMenuAtom);
	// 列表区独立滚动；header 在外层 shrink-0，不随列表滚动。
	const [listScrollEl, setListScrollEl] = useState<HTMLDivElement | null>(null);

	return (
		<div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", className)}>
			<div
				className="group -mx-1.5 flex shrink-0 items-center justify-between pb-1 pl-2 pr-1 pt-1"
				onContextMenu={(event) => {
					event.preventDefault();
					setProjectMenu({ x: event.clientX, y: event.clientY, project });
				}}
			>
				<div className="flex min-w-0 items-center gap-0.5">
					<DefaultConversationFilterSelect />
				</div>
				<div className="flex items-center">
					<button
						type="button"
						title={t("actions.more")}
						onClick={(event) => {
							event.stopPropagation();
							const rect = event.currentTarget.getBoundingClientRect();
							setProjectMenu({ x: rect.left, y: rect.bottom + 4, project });
						}}
						className="flex items-center justify-center rounded-md p-1.5 text-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-60 group-hover:hover:opacity-100"
					>
						<span className="icon-[solar--menu-dots-linear] h-4 w-4" />
					</button>
					{defaultConversationFilter !== "claw" && (
						<button
							type="button"
							title={t("sidebar.nav.newSession")}
							onClick={() => onNewSession(project.cwd)}
							className="flex items-center justify-center rounded-md p-1.5 text-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-60 group-hover:hover:opacity-100"
						>
							<span className="icon-[solar--add-square-outline] h-4 w-4" />
						</button>
					)}
				</div>
			</div>
			<div ref={setListScrollEl} className="min-h-0 flex-1 overflow-y-auto no-scrollbar">
				<DefaultSessionList
					activeSessionPath={activeSessionPath}
					className={cn("project-list-containment -mx-1.5 px-1.5", listClassName)}
					cwd={project.cwd}
					filter={defaultConversationFilter}
					scrollParent={listScrollEl}
					onRenameSession={onRenameSession}
					onSelectSession={onSelectSession}
					sessions={sessions}
				/>
			</div>
		</div>
	);
}
