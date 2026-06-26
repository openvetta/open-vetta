import type { ChangeCode } from "../git/types";

const CODE_META: Record<ChangeCode, { label: string; color: string; title: string }> = {
	M: { label: "M", color: "text-amber-500", title: "modified" },
	A: { label: "A", color: "text-emerald-500", title: "added" },
	D: { label: "D", color: "text-rose-500", title: "deleted" },
	R: { label: "R", color: "text-sky-500", title: "renamed" },
	U: { label: "U", color: "text-violet-400", title: "untracked" },
};

export function StatusBadge({ code }: { code: ChangeCode }): JSX.Element {
	const meta = CODE_META[code];
	return (
		<span className={`git-mono w-3 shrink-0 text-center text-[12px] font-semibold ${meta.color}`} title={meta.title}>
			{meta.label}
		</span>
	);
}
