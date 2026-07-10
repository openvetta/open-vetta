import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-enabled"; id: string; enabled: boolean; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-enabled" || typeof r.id !== "string" || typeof r.enabled !== "boolean") return null;
	return r as unknown as Input;
}

export function PluginsSetEnabledApproval(): JSX.Element | null {
	const approval = useActionApproval("plugins.set-enabled");
	if (!approval) return null;
	return <PluginsSetEnabledApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function PluginsSetEnabledApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = input?.enabled ? "icon-[mdi--power-plug]" : "icon-[mdi--power-plug-off]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.plugins.ops.set-enabled.title")}
			summary={t("manageApproval.plugins.ops.set-enabled.summary")}
			icon={icon}
			badge={t("manageApproval.plugins.ops.set-enabled.badge")}
			labels={frameLabels(request.permission, t("manageApproval.plugins.ops.set-enabled.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--puzzle-outline]" title={input.id} subtitle={t("manageApproval.fields.pluginId")} rows={[{ label: t("manageApproval.fields.enabled"), value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no") }]} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.plugins.ops.set-enabled.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
