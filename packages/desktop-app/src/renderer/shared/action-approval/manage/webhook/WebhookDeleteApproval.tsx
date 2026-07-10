import type { WebhookEndpointPublic } from "@preload/api.js";
import { useEffect, useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalTargetCard, ApprovalWarningCard } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";
interface InputData { operation: "delete"; id: string; }
function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "delete" || typeof r.id !== "string") return null;
	return { operation: "delete", id: r.id };
}
export function WebhookDeleteApproval(): JSX.Element | null {
	const approval = useActionApproval("webhook.delete");
	if (!approval) return null;
	return <Content key={approval.request.approvalId} approval={approval} />;
}
function Content({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const [endpoint, setEndpoint] = useState<WebhookEndpointPublic | null>(null);
	useEffect(() => {
		if (!input?.id) return;
		let cancelled = false;
		void window.vetta.webhook.list().then((items) => {
			if (!cancelled) setEndpoint(items.find((item) => item.id === input.id) ?? null);
		}).catch(() => undefined);
		return () => { cancelled = true; };
	}, [input?.id]);
	return (
		<Frame presentation="dialog" title={t("manageApproval.webhook.ops.delete.title")} summary={t("manageApproval.webhook.ops.delete.summary")} icon="icon-[mdi--delete-outline]" badge={t("manageApproval.webhook.ops.delete.badge")} destructive labels={frameLabels(request.permission, t("manageApproval.webhook.ops.delete.confirm"))} responding={responding} countdown={approval.countdown.formatted} error={error} onReject={reject} onApprove={() => approve()} canApprove={Boolean(input)}>
			{input ? (<><ApprovalTargetCard icon="icon-[mdi--webhook]" title={endpoint?.name ?? input.id} subtitle={endpoint?.urlMask ?? input.id} /><ApprovalImpactCard icon="icon-[mdi--delete-outline]" title={t("manageApproval.afterActionTitle")} description={t("manageApproval.webhook.ops.delete.impact")} destructive /><ApprovalWarningCard>{t("manageApproval.webhook.ops.delete.warning")}</ApprovalWarningCard></>) : (<ApprovalRawFallback input={request.input} />)}
		</Frame>
	);
}
