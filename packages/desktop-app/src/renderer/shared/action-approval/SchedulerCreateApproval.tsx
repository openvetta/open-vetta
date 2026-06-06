import { useState } from "react";
import { Button } from "../components/ui/button";
import { ActionApprovalDrawer } from "./ActionApprovalSurface";
import {
	SchedulerApprovalFields,
	type SchedulerEditableData,
} from "./SchedulerApprovalFields";
import { useActionApproval, type ActiveActionApproval } from "./useActionApproval";
import { useApprovalCountdown } from "./useApprovalCountdown";

interface CreateTaskData extends SchedulerEditableData {
	name: string;
	prompt: string;
	cron: string;
	isOnce: boolean;
	cwd: string;
	skill?: { name: string; alias?: string; type: "skill" | "scene" };
}

interface CreateTaskInput {
	operation: "create";
	data: CreateTaskData;
	approvalUi?: string;
}

export function SchedulerCreateApproval(): JSX.Element | null {
	const approval = useActionApproval("scheduler.create");
	if (!approval) return null;
	return <SchedulerCreateDrawer key={approval.request.approvalId} approval={approval} />;
}

function SchedulerCreateDrawer({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { request, responding, error, approve, reject } = approval;
	const countdown = useApprovalCountdown(approval.request.approvalId);
	const input = request.input as unknown as CreateTaskInput;
	const [data, setData] = useState<SchedulerEditableData>(input.data);

	return (
		<ActionApprovalDrawer
			title="编辑定时任务"
			description={request.summary}
			footer={
			<>
				<Button variant="ghost" size="sm" disabled={responding} onClick={reject}>
					拒绝（{countdown}）
				</Button>
				<Button
					size="sm"
					disabled={responding}
					onClick={() =>
						approve({
							operation: "create",
							data: { ...input.data, ...data },
							approvalUi: input.approvalUi ?? "scheduler.create",
						})
					}
				>
					{responding ? "创建中..." : "确认创建"}
				</Button>
			</>
			}
		>
			<SchedulerApprovalFields value={data} onChange={setData} />
			<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
			{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
		</ActionApprovalDrawer>
	);
}
