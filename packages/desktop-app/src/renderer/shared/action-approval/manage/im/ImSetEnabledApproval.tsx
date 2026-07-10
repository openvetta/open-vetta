import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-enabled"; enabled: boolean; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-enabled" || typeof r.enabled !== "boolean") return null;
	return { operation: "set-enabled", enabled: r.enabled };
}

export function ImSetEnabledApproval(): JSX.Element | null {
	const approval = useActionApproval("im.set-enabled");
	if (!approval) return null;
	return <ImSetEnabledApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function ImSetEnabledApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = input?.enabled ? "icon-[mdi--message-badge-outline]" : "icon-[mdi--message-off-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.im.ops.set-enabled.title")}
			summary={t("manageApproval.im.ops.set-enabled.summary")}
			icon={icon}
			badge={t("manageApproval.im.ops.set-enabled.badge")}
			labels={frameLabels(request.permission, t("manageApproval.im.ops.set-enabled.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon={icon} title={input.enabled ? t("manageApproval.im.enableTitle") : t("manageApproval.im.disableTitle")} rows={[{ label: t("manageApproval.fields.enabled"), value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no") }]} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.im.ops.set-enabled.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
