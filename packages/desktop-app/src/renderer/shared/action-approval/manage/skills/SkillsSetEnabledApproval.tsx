import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-enabled"; name: string; enabled: boolean; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-enabled" || typeof r.name !== "string" || typeof r.enabled !== "boolean") return null;
	return { operation: "set-enabled", name: r.name, enabled: r.enabled };
}

export function SkillsSetEnabledApproval(): JSX.Element | null {
	const approval = useActionApproval("skills.set-enabled");
	if (!approval) return null;
	return <SkillsSetEnabledApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function SkillsSetEnabledApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = input?.enabled ? "icon-[mdi--puzzle-check-outline]" : "icon-[mdi--puzzle-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.skills.ops.set-enabled.title")}
			summary={t("manageApproval.skills.ops.set-enabled.summary")}
			icon={icon}
			badge={t("manageApproval.skills.ops.set-enabled.badge")}
			labels={frameLabels(request.permission, t("manageApproval.skills.ops.set-enabled.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--puzzle-outline]" title={input.name} subtitle={t("manageApproval.fields.skillName")} rows={[{ label: t("manageApproval.fields.enabled"), value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no") }]} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.skills.ops.set-enabled.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
