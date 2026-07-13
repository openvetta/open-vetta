import { useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

type Behavior = "foreground" | "background";

interface InputData {
	operation: "set-quick-panel-behavior";
	behavior: Behavior;
	approvalUi?: string;
}

const BEHAVIORS: Behavior[] = ["foreground", "background"];

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-quick-panel-behavior") return null;
	if (r.behavior !== "foreground" && r.behavior !== "background") return null;
	return {
		operation: "set-quick-panel-behavior",
		behavior: r.behavior,
		approvalUi: typeof r.approvalUi === "string" ? r.approvalUi : undefined,
	};
}

export function ShortcutsSetQuickPanelBehaviorApproval(): JSX.Element | null {
	const approval = useActionApproval("shortcuts.set-quick-panel-behavior");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}

function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [behavior, setBehavior] = useState<Behavior>(input?.behavior ?? "foreground");
	const icon = "icon-[mdi--lightning-bolt-outline]";

	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.shortcuts.ops.set-quick-panel-behavior.title")}
			summary={t("manageApproval.shortcuts.ops.set-quick-panel-behavior.summary")}
			icon={icon}
			badge={t("manageApproval.shortcuts.ops.set-quick-panel-behavior.badge")}
			labels={frameLabels(request.permission, t("manageApproval.shortcuts.ops.set-quick-panel-behavior.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "set-quick-panel-behavior",
							behavior,
							approvalUi: input.approvalUi ?? "shortcuts.set-quick-panel-behavior",
						})
					: approve()
			}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalFormField id="shortcuts-qp-behavior" label={t("manageApproval.fields.quickpanelBehavior")}>
						<select
							id="shortcuts-qp-behavior"
							className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px] text-foreground"
							value={behavior}
							onChange={(e) => setBehavior(e.target.value as Behavior)}
						>
							{BEHAVIORS.map((candidate) => (
								<option key={candidate} value={candidate}>
									{t(`manageApproval.shortcuts.quickPanelBehaviors.${candidate}`)}
								</option>
							))}
						</select>
					</ApprovalFormField>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.shortcuts.ops.set-quick-panel-behavior.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
