import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalValueList } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData { operation: "set-experimental"; data: Record<string, unknown>; }
function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-experimental" || typeof r.data !== "object" || r.data === null) return null;
	return r as unknown as InputData;
}
export function SettingsSetExperimentalApproval(): JSX.Element | null {
	const approval = useActionApproval("settings.set-experimental");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}
function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const rows = input ? Object.entries(input.data).map(([key, value]) => ({
		label: key,
		value: value === null ? t("manageApproval.clearValue") : typeof value === "boolean" ? (value ? t("manageApproval.yes") : t("manageApproval.no")) : String(value),
		mono: typeof value === "string" && value.length > 24,
	})) : [];
	return (
		<Frame presentation="drawer" title={t("manageApproval.settings.ops.set-experimental.title")} summary={t("manageApproval.settings.ops.set-experimental.summary")} icon="icon-[mdi--flask-outline]" badge={t("manageApproval.settings.ops.set-experimental.badge")} labels={frameLabels(request.permission, t("manageApproval.settings.ops.set-experimental.confirm"))} responding={responding} countdown={approval.countdown.formatted} error={error} onReject={reject} onApprove={() => approve()} canApprove={Boolean(input)}>
			{input ? (<><ApprovalValueList rows={rows} /><ApprovalImpactCard icon="icon-[mdi--flask-outline]" title={t("manageApproval.afterActionTitle")} description={t("manageApproval.settings.ops.set-experimental.impact")} /></>) : (<ApprovalRawFallback input={request.input} />)}
		</Frame>
	);
}
