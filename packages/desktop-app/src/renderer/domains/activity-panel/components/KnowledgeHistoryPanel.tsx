import { confirmDialogAtom, type SessionInfo } from "@shared/store/atoms";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/** 列表默认展示条数，点「加载全部」后展开全部记录。 */
const DEFAULT_VISIBLE = 10;

/**
 * 活动面板里的「知识库加工历史」：列出加工 cwd 下的每一轮加工 session（只显示时间），
 * 点击跳转到对应只读 viewer。仅在查看加工 session 时显示，且是该上下文唯一的 tab。
 * 默认只展示前 10 条，可「加载全部」展开；顶部提供「清空记录」。
 */
export function KnowledgeHistoryPanel({ cwd }: { cwd: string | null }): JSX.Element {
	const { t } = useTranslation("settings");
	const navigate = useNavigate();
	const confirm = useSetAtom(confirmDialogAtom);
	// biome-ignore lint/suspicious/noExplicitAny: route params typing
	const params = useParams({ strict: false }) as any;
	const currentPath = typeof params.path === "string" ? decodeURIComponent(params.path) : "";
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [expanded, setExpanded] = useState(false);
	const [clearing, setClearing] = useState(false);

	const reload = useCallback(async () => {
		if (!cwd) {
			setSessions([]);
			return;
		}
		const list = (await window.vetta.session.listSessions(cwd)) as SessionInfo[];
		setSessions(list);
	}, [cwd]);

	useEffect(() => {
		let cancelled = false;
		setExpanded(false);
		void (async () => {
			try {
				if (!cwd) {
					if (!cancelled) setSessions([]);
					return;
				}
				const list = (await window.vetta.session.listSessions(cwd)) as SessionInfo[];
				if (!cancelled) setSessions(list);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [cwd]);

	const open = useCallback(
		(path: string) => {
			void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(path) } });
		},
		[navigate],
	);

	const handleClear = useCallback(() => {
		confirm({
			title: t("kbHistoryClearTitle"),
			message: t("kbHistoryClearMsg"),
			variant: "danger",
			confirmLabel: t("kbHistoryClearConfirm"),
			onConfirm: () => {
				void (async () => {
					setClearing(true);
					try {
						await window.vetta.knowledge.clearRecords();
						setExpanded(false);
						await reload();
					} finally {
						setClearing(false);
					}
				})();
			},
		});
	}, [confirm, t, reload]);

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
				<span className="icon-[mdi--loading] mr-1.5 h-3.5 w-3.5 animate-spin" />
				{t("kbHistoryLoading")}
			</div>
		);
	}
	if (sessions.length === 0) {
		return (
			<div className="py-8 text-center text-[12px] text-muted-foreground/50">{t("kbHistoryEmpty")}</div>
		);
	}

	const visible = expanded ? sessions : sessions.slice(0, DEFAULT_VISIBLE);
	const hasMore = !expanded && sessions.length > DEFAULT_VISIBLE;

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex items-center justify-end px-2 pt-2">
				<button
					type="button"
					onClick={handleClear}
					disabled={clearing}
					className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
				>
					<span
						className={`h-3.5 w-3.5 ${clearing ? "icon-[mdi--loading] animate-spin" : "icon-[mdi--delete-sweep-outline]"}`}
					/>
					{t("kbHistoryClear")}
				</button>
			</div>
			<div className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-1">
				{visible.map((s) => {
					const active = s.path === currentPath;
					return (
						<button
							key={s.path}
							type="button"
							onClick={() => open(s.path)}
							className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
								active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent/50"
							}`}
						>
							<span className="icon-[mdi--history] h-3.5 w-3.5 shrink-0 opacity-60" />
							<span className="truncate">{new Date(s.modifiedAt).toLocaleString()}</span>
						</button>
					);
				})}
				{hasMore && (
					<button
						type="button"
						onClick={() => setExpanded(true)}
						className="mt-1 rounded-lg px-2.5 py-1.5 text-center text-[12px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
					>
						{t("kbHistoryLoadAll", { count: sessions.length })}
					</button>
				)}
			</div>
		</div>
	);
}
