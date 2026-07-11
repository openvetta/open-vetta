import { useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { formatExecutionMode } from "../../approvalCopy";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";
import { cn } from "../../../lib/utils";

type ExecutionMode = "sandbox" | "full-access";

interface Input {
	operation: "set-execution-mode";
	mode: ExecutionMode;
	approvalUi?: string;
}

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-execution-mode") return null;
	if (r.mode !== "sandbox" && r.mode !== "full-access") return null;
	return r as unknown as Input;
}

const MODES: ExecutionMode[] = ["sandbox", "full-access"];

export function SettingsSetExecutionModeApproval(): JSX.Element | null {
	const approval = useActionApproval("settings.set-execution-mode");
	if (!approval) return null;
	return <SettingsSetExecutionModeApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function SettingsSetExecutionModeApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [mode, setMode] = useState<ExecutionMode>(input?.mode ?? "sandbox");
	const icon = "icon-[mdi--shield-lock-outline]";

	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.settings.ops.set-execution-mode.title")}
			summary={t("manageApproval.settings.ops.set-execution-mode.summary")}
			icon={icon}
			badge={t("manageApproval.settings.ops.set-execution-mode.badge")}
			labels={frameLabels(request.permission, t("manageApproval.settings.ops.set-execution-mode.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "set-execution-mode",
							mode,
							approvalUi: input.approvalUi ?? "settings.set-execution-mode",
						})
					: approve()
			}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalFormField id="execution-mode" label={t("manageApproval.fields.executionMode")}>
						<div className="grid grid-cols-1 gap-2">
							{MODES.map((candidate) => {
								const active = mode === candidate;
								return (
									<button
										key={candidate}
										type="button"
										onClick={() => setMode(candidate)}
										className={cn(
											"rounded-lg border px-3 py-2.5 text-left transition-colors",
											active
												? "border-primary/70 bg-primary/5 ring-1 ring-inset ring-primary/30"
												: "border-border hover:border-primary/40 hover:bg-accent/40",
										)}
									>
										<div className="text-[12px] font-medium text-foreground">
											{formatExecutionMode(t, candidate)}
										</div>
										<div className="mt-0.5 text-[10px] text-muted-foreground">
											{candidate === "sandbox"
												? t("manageApproval.settings.executionModeSandboxHint")
												: t("manageApproval.settings.executionModeFullAccessHint")}
										</div>
									</button>
								);
							})}
						</div>
					</ApprovalFormField>
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
