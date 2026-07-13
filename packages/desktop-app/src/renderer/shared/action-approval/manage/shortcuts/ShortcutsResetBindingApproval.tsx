import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalValueList } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData {
	operation: "reset-binding";
	id: string;
	approvalUi?: string;
}

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "reset-binding" || typeof r.id !== "string") return null;
	return {
		operation: "reset-binding",
		id: r.id,
		approvalUi: typeof r.approvalUi === "string" ? r.approvalUi : undefined,
	};
}

export function ShortcutsResetBindingApproval(): JSX.Element | null {
	const approval = useActionApproval("shortcuts.reset-binding");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}

function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--keyboard-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.shortcuts.ops.reset-binding.title")}
			summary={t("manageApproval.shortcuts.ops.reset-binding.summary")}
			icon={icon}
			badge={t("manageApproval.shortcuts.ops.reset-binding.badge")}
			labels={frameLabels(request.permission, t("manageApproval.shortcuts.ops.reset-binding.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "reset-binding",
							id: input.id,
							approvalUi: input.approvalUi ?? "shortcuts.reset-binding",
						})
					: approve()
			}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalValueList
						rows={[{ label: t("manageApproval.fields.shortcutActionId"), value: input.id, mono: true }]}
					/>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.shortcuts.ops.reset-binding.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
