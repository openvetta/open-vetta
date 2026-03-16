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
					title={t.label}
					onClick={() => setTab(t.value)}
					className={cn(
						"no-drag flex flex-1 items-center justify-center py-1.5 transition-colors",
						tab === t.value
							? "border-b-2 border-[var(--accent)] text-[var(--text-1)]"
							: "border-b-2 border-transparent text-[var(--text-1)] opacity-60 hover:opacity-100",
					)}
				>
					<span className={cn(t.icon, "h-4 w-4")} />
				</button>
			))}
		</div>
	);
}
