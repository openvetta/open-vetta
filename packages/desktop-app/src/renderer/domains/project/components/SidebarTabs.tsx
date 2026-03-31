import { useAtom } from "jotai";
import { sidebarFilterAtom, sidebarModeAtom, type SidebarFilter, type SidebarMode } from "@shared/store/atoms";
import { SegmentedControl, type SegmentedControlItem } from "@shared/components/ui/segmented-control";

const FILTER_OPTIONS: { value: SidebarFilter; label: string }[] = [
	{ value: "all", label: "全部" },
	{ value: "normal", label: "普通" },
	{ value: "schedule", label: "自动化" },
	{ value: "batch", label: "批量任务" },
	{ value: "flowing", label: "流转" },
];

export function SidebarFilterSelect(): JSX.Element {
	const [filter, setFilter] = useAtom(sidebarFilterAtom);

	return (
		<select
			value={filter}
			onChange={(e) => setFilter(e.target.value as SidebarFilter)}
			className="no-drag cursor-pointer appearance-none rounded-md border-none bg-transparent px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground outline-none hover:bg-accent"
		>
			{FILTER_OPTIONS.map((opt) => (
				<option key={opt.value} value={opt.value}>
					{opt.label}
				</option>
			))}
		</select>
	);
}

const MODE_ITEMS: SegmentedControlItem<SidebarMode>[] = [
	{ key: "projects", label: "项目" },
	{ key: "files", label: "文件" },
];

export function SidebarModeToggle(): JSX.Element {
	const [mode, setMode] = useAtom(sidebarModeAtom);

	return (
		<SegmentedControl
			items={MODE_ITEMS}
			value={mode}
			onChange={setMode}
			className="no-drag"
		/>
	);
}
