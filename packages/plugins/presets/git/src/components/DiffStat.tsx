import { useTranslation } from "@vetta-org/plugin-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { diffStat } from "../git/run";
import { onRefreshSignal } from "../git/runtime";

const EMPTY = { additions: 0, deletions: 0, untrackedTruncated: false };

/**
 * 工作区的增删行数（`+251 −127`）。
 *
 * 它描述的是「这个面板里全部未提交内容」的总量，因此放在面板页头、刷新键左边：
 * 和刷新挨着，才知道这个数字是「截至刚才那一次刷新」的。工具栏那边只留动作，
 * 不再把只读统计混进一排按钮里。
 */
export function DiffStat({ root }: { root: string }): JSX.Element | null {
	const { t } = useTranslation();
	const [stat, setStat] = useState(EMPTY);
	// 重载会重叠且乱序返回，只让最新一次写状态。
	const idRef = useRef(0);

	const reload = useCallback(() => {
		const id = ++idRef.current;
		void diffStat(root)
			.then((value) => {
				if (id === idRef.current) setStat(value);
			})
			.catch(() => {});
	}, [root]);

	useEffect(() => {
		reload();
		return onRefreshSignal(reload);
	}, [reload]);

	if (stat.additions === 0 && stat.deletions === 0) return null;

	return (
		<span
			className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium leading-none tabular-nums"
			title={stat.untrackedTruncated ? t("stat.untrackedTruncated") : undefined}
		>
			{stat.additions > 0 ? (
				<span className="text-emerald-500/90">
					+{stat.additions}
					{stat.untrackedTruncated && "+"}
				</span>
			) : null}
			{stat.deletions > 0 ? <span className="text-rose-500/90">−{stat.deletions}</span> : null}
		</span>
	);
}
