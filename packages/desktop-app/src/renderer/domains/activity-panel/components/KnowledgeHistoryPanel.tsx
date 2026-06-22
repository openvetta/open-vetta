import { type SessionInfo } from "@shared/store/atoms";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

/**
 * 活动面板里的「知识库加工历史」：列出加工 cwd 下的每一轮加工 session（只显示时间），
 * 点击跳转到对应只读 viewer。仅在查看加工 session 时显示，且是该上下文唯一的 tab。
 */
export function KnowledgeHistoryPanel({ cwd }: { cwd: string | null }): JSX.Element {
	const navigate = useNavigate();
	// biome-ignore lint/suspicious/noExplicitAny: route params typing
	const params = useParams({ strict: false }) as any;
	const currentPath = typeof params.path === "string" ? decodeURIComponent(params.path) : "";
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
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

	if (loading) {
		return (
			<div className="flex items-center justify-center py-8 text-[12px] text-muted-foreground/50">
				<span className="icon-[mdi--loading] mr-1.5 h-3.5 w-3.5 animate-spin" />
				加载中…
			</div>
		);
	}
	if (sessions.length === 0) {
		return <div className="py-8 text-center text-[12px] text-muted-foreground/50">还没有整理记录</div>;
	}
	return (
		<div className="flex flex-col gap-0.5 overflow-y-auto p-2">
			{sessions.map((s) => {
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
		</div>
	);
}
