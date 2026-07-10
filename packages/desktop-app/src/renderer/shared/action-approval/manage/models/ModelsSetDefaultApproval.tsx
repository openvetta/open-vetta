import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-default"; modelKey: string; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-default" || typeof r.modelKey !== "string") return null;
	return { operation: "set-default", modelKey: r.modelKey };
}

export function ModelsSetDefaultApproval(): JSX.Element | null {
	const approval = useActionApproval("models.set-default");
	if (!approval) return null;
	return <ModelsSetDefaultApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function ModelsSetDefaultApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--star-check-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.models.ops.set-default.title")}
			summary={t("manageApproval.models.ops.set-default.summary")}
			icon={icon}
			badge={t("manageApproval.models.ops.set-default.badge")}
			labels={frameLabels(request.permission, t("manageApproval.models.ops.set-default.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--robot-outline]" title={input.modelKey} subtitle={t("manageApproval.fields.modelKey")} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.models.ops.set-default.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
