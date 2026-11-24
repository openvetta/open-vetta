import type { ReactNode } from "react";
import type { ChangeEntry } from "../git/types";
import type { MenuPoint } from "./ChangeMenu";
import { GitFlatList } from "./GitFlatList";
import { ChevronIcon } from "./icons";
import { SplitHandle } from "./SplitHandle";

/** Floor for a section body, so a one-file section is still usable when squeezed. */
const MIN_BODY = 48;
/** Header row height (h-7). */
const HEADER = 28;
/** Smallest height an expanded section may be dragged to: header plus a usable body. */
export const SECTION_MIN_HEIGHT = MIN_BODY + HEADER;

/**
 * One labelled, collapsible section of the change list (conflicts / staged /
 * unstaged) listing its files as flat rows.
 *
 * A flat list keeps every file on one line with its own name only — a nested
 * tree pushed names out of the narrow panel and hid where a file actually lives.
 * The full path is shown by the diff pane once a file is picked. Each section
 * owns its own selection, so batch actions always address a single, unambiguous
 * side.
 */
export function ChangeSectionList({
	title,
	entries,
	collapsed,
	onToggleCollapsed,
	selectedPaths,
	onSelectionChange,
	renderMenu,
	actions,
	tone,
	weight,
	onResize,
	onResizeStart,
	resizeTitle,
}: {
	title: string;
	entries: readonly ChangeEntry[];
	collapsed: boolean;
	onToggleCollapsed: () => void;
	selectedPaths: readonly string[];
	onSelectionChange: (paths: string[], added: string | null) => void;
	/** Context-menu body for the right-clicked paths in this section. */
	renderMenu?: (paths: string[], close: () => void, point?: MenuPoint) => ReactNode;
	/** Section-level buttons, revealed on hover of the header. */
	actions?: ReactNode;
	tone?: "danger";
	/** Flex weight; defaults to the file count so sections start proportional to their size. */
	weight?: number;
	/** Present when the section below can be resized against this one. */
	onResize?: (deltaY: number) => void;
	onResizeStart?: () => void;
	/** Hover hint for the resize handle. */
	resizeTitle?: string;
}): JSX.Element | null {
	if (entries.length === 0) return null;

	return (
		// Expanded sections share all the space left below the commit box, split in
		// proportion to how many files each holds; the tree scrolls internally once
		// its share is too small. A collapsed section keeps only its header.
		<div
			className={`relative flex flex-col ${collapsed ? "shrink-0" : "min-h-0"}`}
			style={collapsed ? undefined : { flex: `${weight ?? entries.length} 1 0`, minHeight: MIN_BODY }}
		>
			<div className="group flex h-7 items-center gap-1 px-1.5">
				<button
					type="button"
					onClick={onToggleCollapsed}
					className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-medium tracking-wide text-muted-foreground transition-colors hover:text-foreground"
				>
					<ChevronIcon className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
					<span className={`truncate ${tone === "danger" ? "text-orange-500" : ""}`}>{title}</span>
					<span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums text-muted-foreground/80">{entries.length}</span>
				</button>
				{actions && <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{actions}</div>}
			</div>
			{!collapsed && (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden">
					<GitFlatList
						entries={entries}
						selectedPaths={selectedPaths}
						onSelectionChange={onSelectionChange}
						renderMenu={renderMenu}
						showDirectory={false}
					/>
				</div>
			)}
			{/* 分区间可上下拉伸：把下方分区的可视高度调大，不必靠折叠整个分区。 */}
			{!collapsed && onResize && (
				<SplitHandle orientation="horizontal" onDrag={onResize} onDragStart={onResizeStart} title={resizeTitle} />
			)}
		</div>
	);
}
