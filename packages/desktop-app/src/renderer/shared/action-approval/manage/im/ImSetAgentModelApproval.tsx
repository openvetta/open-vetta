import { useState } from "react";
import { Input } from "../../../components/ui/input";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalFormField, ApprovalImpactCard, ApprovalRawFallback } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";
interface InputData { operation: "set-agent-model"; modelKey: string | null; reasoningLevel?: string; approvalUi?: string; }
function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-agent-model") return null;
	return r as unknown as InputData;
}
export function ImSetAgentModelApproval(): JSX.Element | null {
	const approval = useActionApproval("im.set-agent-model");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}
function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [modelKey, setModelKey] = useState(input?.modelKey === null || input?.modelKey === undefined ? "" : input.modelKey);
	const [reasoningLevel, setReasoningLevel] = useState(input?.reasoningLevel ?? "");
	return (
		<Frame presentation="drawer" title={t("manageApproval.im.ops.set-agent-model.title")} summary={t("manageApproval.im.ops.set-agent-model.summary")} icon="icon-[mdi--robot-outline]" badge={t("manageApproval.im.ops.set-agent-model.badge")} labels={frameLabels(request.permission, t("manageApproval.im.ops.set-agent-model.confirm"))} responding={responding} countdown={approval.countdown.formatted} error={error} onReject={reject} onApprove={() => {
			if (!input) { approve(); return; }
			const trimmed = modelKey.trim();
			approve({ operation: "set-agent-model", modelKey: trimmed.length === 0 ? null : trimmed, ...(reasoningLevel.trim() ? { reasoningLevel: reasoningLevel.trim() } : {}), approvalUi: input.approvalUi ?? "im.set-agent-model" });
		}} canApprove={Boolean(input)}>
			{input ? (<><ApprovalFormField id="im-model-key" label={t("manageApproval.fields.modelKey")}><Input id="im-model-key" value={modelKey} placeholder={t("manageApproval.im.modelKeyPlaceholder")} onChange={(e) => setModelKey(e.target.value)} /></ApprovalFormField><ApprovalFormField id="im-reasoning" label={t("manageApproval.fields.reasoningLevel")}><Input id="im-reasoning" value={reasoningLevel} onChange={(e) => setReasoningLevel(e.target.value)} /></ApprovalFormField><ApprovalImpactCard icon="icon-[mdi--robot-outline]" title={t("manageApproval.afterActionTitle")} description={t("manageApproval.im.ops.set-agent-model.impact")} /></>) : (<ApprovalRawFallback input={request.input} />)}
		</Frame>
	);
}
