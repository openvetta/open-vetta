import { useState } from "react";
import { Button } from "../components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "../components/ui/drawer";
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
		<Drawer open direction="right" dismissible={false}>
			<DrawerContent className="w-[min(520px,calc(100vw-2rem))] sm:max-w-[520px]">
				<DrawerHeader className="border-b border-border/60">
					<DrawerTitle>编辑定时任务</DrawerTitle>
					<DrawerDescription>{request.summary}</DrawerDescription>
				</DrawerHeader>
				<div className="min-h-0 flex-1 overflow-y-auto p-4">
					<SchedulerApprovalFields value={data} onChange={setData} />
					<div className="mt-4 text-[11px] text-muted-foreground">权限：{request.permission}</div>
					{error && <div className="mt-2 text-[11px] text-destructive">{error}</div>}
				</div>
				<DrawerFooter className="border-t border-border/60">
					<Button variant="outline" size="sm" disabled={responding} onClick={reject}>
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
				</DrawerFooter>
			</DrawerContent>
		</Drawer>
	);
}
