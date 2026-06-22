import { type SessionInfo } from "@shared/store/atoms";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

/**
 * 知识库「整理记录」独立只读页：列出每一轮后台加工的会话，点击进入只读
 * SessionViewer（无输入框、不可交互，参考 Claw 只读）。不进侧边栏项目列表。
 */
export function KnowledgeRecordsPage(): JSX.Element {
	const navigate = useNavigate();
	const [sessions, setSessions] = useState<SessionInfo[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const config = await window.vetta.config.get();
				const cwd = config.knowledgeProcessingCwd;
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
	}, []);

	const openSession = useCallback(
		(path: string) => {
			void navigate({ to: "/viewer/$path", params: { path: encodeURIComponent(path) } });
		},
		[navigate],
	);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="drag-region h-12 shrink-0" />
			<div className="flex shrink-0 items-center gap-3 px-8 pb-4">
				<button
					type="button"
					onClick={() => void navigate({ to: "/settings/$tab", params: { tab: "knowledge" } })}
					className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
					title="返回"
				>
					<span className="icon-[mdi--arrow-left] h-4 w-4" />
				</button>
				<div>
					<h1 className="text-[20px] font-bold tracking-tight text-foreground">整理记录</h1>
					<p className="text-[11px] text-muted-foreground/60">每一条是一次自动整理，点开可只读查看 AI 做了什么</p>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-8 pb-8">
				{loading ? (
					<div className="flex items-center justify-center py-16 text-[13px] text-muted-foreground/60">
						<span className="icon-[mdi--loading] mr-2 h-4 w-4 animate-spin" />
						加载中…
					</div>
				) : sessions.length === 0 ? (
					<div className="py-16 text-center text-[13px] text-muted-foreground/60">还没有整理记录</div>
				) : (
					<div className="flex flex-col gap-1">
						{sessions.map((s) => (
							<button
								key={s.path}
								type="button"
								onClick={() => openSession(s.path)}
								className="flex flex-col items-start gap-0.5 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-input hover:bg-accent/50"
							>
								<span className="text-[13px] font-medium text-foreground">
									{s.name || s.firstMessage || "未命名整理"}
								</span>
								<span className="text-[11px] text-muted-foreground/60">
									{new Date(s.modifiedAt).toLocaleString()}
								</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
