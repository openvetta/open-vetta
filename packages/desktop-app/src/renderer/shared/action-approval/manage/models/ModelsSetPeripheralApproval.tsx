import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-peripheral"; modelKey: string | null; reasoningLevel?: string | null; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-peripheral") return null;
	if (!(typeof r.modelKey === "string" || r.modelKey === null)) return null;
	return r as unknown as Input;
}

export function ModelsSetPeripheralApproval(): JSX.Element | null {
	const approval = useActionApproval("models.set-peripheral");
	if (!approval) return null;
	return <ModelsSetPeripheralApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function ModelsSetPeripheralApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--chip]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.models.ops.set-peripheral.title")}
			summary={t("manageApproval.models.ops.set-peripheral.summary")}
			icon={icon}
			badge={t("manageApproval.models.ops.set-peripheral.badge")}
			labels={frameLabels(request.permission, t("manageApproval.models.ops.set-peripheral.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard
						icon="icon-[mdi--chip]"
						title={input.modelKey === null ? t("manageApproval.clearValue") : input.modelKey}
						rows={input.reasoningLevel !== undefined ? [{
							label: t("manageApproval.fields.reasoningLevel"),
							value: input.reasoningLevel === null ? t("manageApproval.clearValue") : String(input.reasoningLevel),
						}] : undefined}
					/>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.models.ops.set-peripheral.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
