import { useAtomValue } from "jotai";
import { flowingPendingListAtom } from "@shared/store/atoms";
import { Button } from "@shared/components/ui/button";
import { useFlowingReceive } from "../hooks/useFlowingReceive";

export function FlowingPanel(): JSX.Element {
	const pendingList = useAtomValue(flowingPendingListAtom);
	const { processing, accept, reject } = useFlowingReceive();

	if (pendingList.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
				<span className="icon-[mdi--inbox-outline] text-3xl text-muted-foreground/30" />
				<p className="text-xs text-muted-foreground/50">暂无待处理流转</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2 p-2">
			{pendingList.map((t) => (
				<div key={t.id} className="rounded-lg border p-3 text-xs">
					<div className="flex items-center gap-2">
						<span className="icon-[mdi--account] text-sm text-muted-foreground" />
						<span className="font-medium">{t.sender_name}</span>
						<span className="text-muted-foreground">发来了</span>
						<span className="font-medium">{t.project_name}</span>
					</div>

					{t.message && (
						<div className="mt-1.5 rounded bg-muted/50 p-2 text-muted-foreground">{t.message}</div>
					)}

					<div className="mt-1.5 text-muted-foreground/70">
						{t.file_list.length} 个文件
						<span className="mx-1">·</span>
						{new Date(t.created_at).toLocaleString("zh-CN")}
					</div>

					<div className="mt-2 flex gap-2">
						<Button size="sm" variant="outline" onClick={() => reject(t)} disabled={processing}>
							拒绝
						</Button>
						<Button size="sm" onClick={() => accept(t)} disabled={processing}>
							{processing ? "处理中..." : "接受"}
						</Button>
					</div>
				</div>
			))}
		</div>
	);
}
