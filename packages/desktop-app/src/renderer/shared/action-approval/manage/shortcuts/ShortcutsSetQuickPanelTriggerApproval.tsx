import { useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

type Trigger = "none" | "mod" | "alt" | "shift";

interface InputData {
	operation: "set-quick-panel-trigger";
	trigger: Trigger;
	approvalUi?: string;
}

const TRIGGERS: Trigger[] = ["none", "mod", "alt", "shift"];

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-quick-panel-trigger") return null;
	if (r.trigger !== "none" && r.trigger !== "mod" && r.trigger !== "alt" && r.trigger !== "shift") return null;
	return {
		operation: "set-quick-panel-trigger",
		trigger: r.trigger,
		approvalUi: typeof r.approvalUi === "string" ? r.approvalUi : undefined,
	};
}

export function ShortcutsSetQuickPanelTriggerApproval(): JSX.Element | null {
	const approval = useActionApproval("shortcuts.set-quick-panel-trigger");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}

function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [trigger, setTrigger] = useState<Trigger>(input?.trigger ?? "none");
	const icon = "icon-[mdi--lightning-bolt-outline]";

	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.shortcuts.ops.set-quick-panel-trigger.title")}
			summary={t("manageApproval.shortcuts.ops.set-quick-panel-trigger.summary")}
			icon={icon}
			badge={t("manageApproval.shortcuts.ops.set-quick-panel-trigger.badge")}
			labels={frameLabels(request.permission, t("manageApproval.shortcuts.ops.set-quick-panel-trigger.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "set-quick-panel-trigger",
							trigger,
							approvalUi: input.approvalUi ?? "shortcuts.set-quick-panel-trigger",
						})
					: approve()
			}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalFormField id="shortcuts-qp-trigger" label={t("manageApproval.fields.quickpanelTrigger")}>
						<select
							id="shortcuts-qp-trigger"
							className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
							value={trigger}
							onChange={(e) => setTrigger(e.target.value as Trigger)}
						>
							{TRIGGERS.map((candidate) => (
								<option key={candidate} value={candidate}>
									{t(`manageApproval.shortcuts.quickPanelTriggers.${candidate}`)}
								</option>
							))}
						</select>
					</ApprovalFormField>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.shortcuts.ops.set-quick-panel-trigger.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
