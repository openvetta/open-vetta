import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-execution-mode"; mode: "sandbox" | "full-access"; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-execution-mode") return null;
	return r as unknown as Input;
}

export function SettingsSetExecutionModeApproval(): JSX.Element | null {
	const approval = useActionApproval("settings.set-execution-mode");
	if (!approval) return null;
	return <SettingsSetExecutionModeApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function SettingsSetExecutionModeApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--shield-lock-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.settings.ops.set-execution-mode.title")}
			summary={t("manageApproval.settings.ops.set-execution-mode.summary")}
			icon={icon}
			badge={t("manageApproval.settings.ops.set-execution-mode.badge")}
			labels={frameLabels(request.permission, t("manageApproval.settings.ops.set-execution-mode.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--shield-lock-outline]" title={String(input.mode)} subtitle={t("manageApproval.fields.executionMode")} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.settings.ops.set-execution-mode.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
