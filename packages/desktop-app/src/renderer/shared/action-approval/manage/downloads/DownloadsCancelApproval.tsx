import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
	ApprovalWarningCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "cancel"; id: string; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "cancel" || typeof r.id !== "string") return null;
	return { operation: "cancel", id: r.id };
}

export function DownloadsCancelApproval(): JSX.Element | null {
	const approval = useActionApproval("downloads.cancel");
	if (!approval) return null;
	return <DownloadsCancelApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function DownloadsCancelApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--download-off-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.downloads.ops.cancel.title")}
			summary={t("manageApproval.downloads.ops.cancel.summary")}
			icon={icon}
			badge={t("manageApproval.downloads.ops.cancel.badge")}
			destructive
			labels={frameLabels(request.permission, t("manageApproval.downloads.ops.cancel.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--download-outline]" title={input.id} subtitle={t("manageApproval.fields.id")} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.downloads.ops.cancel.impact")}
						destructive
					/>
					<ApprovalWarningCard>{t("manageApproval.downloads.ops.cancel.warning")}</ApprovalWarningCard>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
