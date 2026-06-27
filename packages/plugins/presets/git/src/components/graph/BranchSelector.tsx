import { useTranslation } from "@vetta/plugin-sdk";
import type { BranchRef, GraphScope, GraphSelection } from "../../git/types";
import { BranchIcon } from "../icons";

const SCOPES: GraphScope[] = ["local", "remote"];

/** Top switcher: local/remote scope segmented toggle + a branch dropdown (all = whole scope). */
export function BranchSelector({
	selection,
	branches,
	onChange,
}: {
	selection: GraphSelection;
	branches: readonly BranchRef[];
	onChange: (next: GraphSelection) => void;
}): JSX.Element {
	const { t } = useTranslation();

	return (
		<div className="flex h-8 shrink-0 items-center gap-2 border-b border-border px-2">
			<div className="flex shrink-0 items-center rounded-md bg-muted/60 p-0.5 text-[11px]">
				{SCOPES.map((scope) => (
					<button
						key={scope}
						type="button"
						onClick={() => scope !== selection.scope && onChange({ scope, branch: null })}
						className={`rounded px-2 py-0.5 transition-colors ${
							selection.scope === scope ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
						}`}
					>
						{scope === "local" ? t("branch.scopeLocal") : t("branch.scopeRemote")}
					</button>
				))}
			</div>

			<div className="flex min-w-0 flex-1 items-center gap-1.5">
				<BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<select
					value={selection.branch ?? ""}
					onChange={(e) => onChange({ ...selection, branch: e.target.value || null })}
					title={t("branch.placeholder")}
					className="min-w-0 flex-1 truncate rounded-md bg-transparent py-0.5 text-[12px] text-foreground outline-none hover:bg-accent/40"
				>
					<option value="">{t("branch.all")}</option>
					{branches.map((b) => (
						<option key={b.name} value={b.name}>
							{b.name}
						</option>
					))}
				</select>
			</div>
		</div>
	);
}
