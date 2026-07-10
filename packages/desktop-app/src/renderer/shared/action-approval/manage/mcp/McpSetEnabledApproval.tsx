import { useTranslation } from "react-i18next";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalTargetCard } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface McpSetEnabledInput {
	operation: "set-enabled";
	name: string;
	enabled: boolean;
}

function parseInput(input: unknown): McpSetEnabledInput | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const record = input as Record<string, unknown>;
	if (record.operation !== "set-enabled" || typeof record.name !== "string" || typeof record.enabled !== "boolean") {
		return null;
	}
	return { operation: "set-enabled", name: record.name, enabled: record.enabled };
}

export function McpSetEnabledApproval(): JSX.Element | null {
	const approval = useActionApproval("mcp.set-enabled");
	if (!approval) return null;
	return <McpSetEnabledApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function McpSetEnabledApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = input?.enabled ? "icon-[mdi--toggle-switch]" : "icon-[mdi--toggle-switch-off-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.mcp.ops.set-enabled.title")}
			summary={t("manageApproval.mcp.ops.set-enabled.summary")}
			icon={icon}
			badge={t("manageApproval.mcp.ops.set-enabled.badge")}
			labels={frameLabels(request.permission, t("manageApproval.mcp.ops.set-enabled.confirm"))}
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
						icon="icon-[mdi--server-network]"
						title={input.name}
						subtitle={t("manageApproval.fields.serverName")}
						rows={[
							{
								label: t("manageApproval.fields.enabled"),
								value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no"),
							},
						]}
					/>
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.mcp.ops.set-enabled.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
