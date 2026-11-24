import { useTranslation } from "@vetta-org/plugin-sdk";
import { SegmentedControl } from "@vetta-org/theme-ui/plugin-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vetta-org/ui";
import { useMemo } from "react";
import type { BranchRef, GraphScope, GraphSelection } from "../../git/types";
import { BranchIcon } from "../icons";

const SCOPES: GraphScope[] = ["local", "remote"];
/** Radix Select disallows empty item values; maps to `branch: null` (all branches). */
const ALL_BRANCHES = "__all__";

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
	const selectValue = selection.branch ?? ALL_BRANCHES;
	// 作用域切换同样走宿主控件，与变更视图的「变更 / 提交图」是同一个分段按钮。
	const scopeItems = useMemo(
		() =>
			SCOPES.map((scope) => ({
				key: scope,
				label: scope === "local" ? t("branch.scopeLocal") : t("branch.scopeRemote"),
			})),
		[t],
	);

	return (
		<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
			{/* 与右侧分支下拉（SelectTrigger size="sm"）等高，同一行里两个胶囊才齐平。 */}
			<SegmentedControl
				items={scopeItems}
				value={selection.scope}
				onChange={(scope) => scope !== selection.scope && onChange({ scope, branch: null })}
				className="h-7"
			/>
			<div className="ml-auto flex min-w-0 items-center gap-1.5">
				<BranchIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				<Select
					value={selectValue}
					onValueChange={(value) =>
						onChange({
							...selection,
							branch: value === ALL_BRANCHES ? null : value,
						})
					}
				>
					<SelectTrigger title={t("branch.placeholder")} className="min-w-0 max-w-full">
						<SelectValue placeholder={t("branch.placeholder")} />
					</SelectTrigger>
					<SelectContent className="max-h-64">
						<SelectItem value={ALL_BRANCHES}>{t("branch.all")}</SelectItem>
						{branches.map((b) => (
							<SelectItem key={b.name} value={b.name}>
								{b.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
