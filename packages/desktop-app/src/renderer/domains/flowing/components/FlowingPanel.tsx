import { useAtomValue } from "jotai";
import { flowingPendingListAtom } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { useFlowingReceive } from "../hooks/useFlowingReceive";

function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return "刚刚";
	if (minutes < 60) return `${minutes} 分钟前`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} 小时前`;
	const days = Math.floor(hours / 24);
	return `${days} 天前`;
}

export function FlowingPanel(): JSX.Element {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
				<div className="flex size-10 items-center justify-center rounded-full bg-muted/50">
					<span className="icon-[mdi--inbox-outline] text-xl text-muted-foreground/40" />
				</div>
				<p className="text-xs text-muted-foreground/50">暂无待处理流转</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-2">
			{pendingList.map((t) => (
				<div
					key={t.id}
					className="group rounded-lg border border-border/50 bg-card p-3 text-xs transition-colors hover:border-border"
				>
					{/* 发送方信息 */}
					<div className="flex items-center gap-2">
						<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6rem] font-medium text-primary">
							{t.sender_name.charAt(0).toUpperCase()}
						</span>
						<div className="min-w-0 flex-1">
							<span className="font-medium">{t.sender_name}</span>
							<span className="mx-1 text-muted-foreground/60">→</span>
							<span className="font-medium text-primary">{t.project_name}</span>
						</div>
						<span className="shrink-0 text-[0.65rem] text-muted-foreground/50" title={new Date(t.created_at).toLocaleString("zh-CN")}>
							{timeAgo(t.created_at)}
						</span>
					</div>

					{/* 附加消息 */}
					{t.message && (
						<div className="mt-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-muted-foreground">
							{t.message}
						</div>
					)}

					{/* 文件数量 */}
					<div className="mt-2 flex items-center gap-1 text-muted-foreground/60">
						<span className="icon-[mdi--file-document-outline] text-xs" />
						{t.file_list.length} 个文件
					</div>

					{/* 操作按钮 */}
					<div className="mt-2.5 flex gap-2">
						<Button
							size="xs"
							variant="ghost"
							className="flex-1 text-muted-foreground hover:text-destructive"
							onClick={() => reject(t)}
							disabled={processing}
						>
							拒绝
						</Button>
						<Button size="xs" className="flex-1" onClick={() => accept(t)} disabled={processing}>
							{processing ? (
								<>
									<span className="icon-[mdi--loading] animate-spin" data-icon="inline-start" />
									处理中
								</>
							) : (
								<>
									<span className="icon-[mdi--check] text-xs" data-icon="inline-start" />
									接受
								</>
							)}
						</Button>
					</div>
				</div>
			))}
		</div>
	);
}
