import { useAtom } from "jotai";
import { sidebarTabAtom, type SidebarTab } from "../../store/atoms";
import { cn } from "../../lib/utils";

const TABS: { value: SidebarTab; label: string; icon: string }[] = [
	{ value: "projects", label: "项目", icon: "icon-[mdi--folder-multiple-outline]" },
	{ value: "files", label: "文件", icon: "icon-[mdi--file-tree-outline]" },
];

export function SidebarTabs(): JSX.Element {
	const [tab, setTab] = useAtom(sidebarTabAtom);

	return (
		<div className="flex border-b border-[var(--border)] px-2">
			{TABS.map((t) => (
				<button
					key={t.value}
					type="button"
					onClick={() => setTab(t.value)}
					className={cn(
						"no-drag flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium transition-colors",
						tab === t.value
							? "border-b-2 border-[var(--accent)] text-[var(--text-1)]"
							: "border-b-2 border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]",
					)}
				>
					<span className={cn(t.icon, "h-3.5 w-3.5")} />
					{t.label}
				</button>
			))}
		</div>
	);
}
