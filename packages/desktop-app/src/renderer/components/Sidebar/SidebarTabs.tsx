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
		<div className="flex items-center gap-0.5 px-1.5">
			{TABS.map((t) => (
				<button
					key={t.value}
					type="button"
					title={t.label}
					onClick={() => setTab(t.value)}
					className={cn(
						"no-drag flex items-center justify-center rounded-md p-1.5 transition-colors",
						tab === t.value
							? "bg-[var(--hover-strong)] text-[var(--text-1)]"
							: "text-[var(--text-1)] opacity-60 hover:bg-[var(--hover-strong)] hover:opacity-100",
					)}
				>
					<span className={cn(t.icon, "h-4 w-4")} />
				</button>
			))}
		</div>
	);
}
