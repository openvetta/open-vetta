import type { WebhookEndpointPublic } from "@preload/api.js";
import { useEffect, useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalTargetCard } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData { operation: "set-enabled"; id: string; enabled: boolean; }
function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-enabled" || typeof r.id !== "string" || typeof r.enabled !== "boolean") return null;
	return r as unknown as InputData;
}
export function WebhookSetEnabledApproval(): JSX.Element | null {
	const approval = useActionApproval("webhook.set-enabled");
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
	const icon = input?.enabled ? "icon-[mdi--toggle-switch]" : "icon-[mdi--toggle-switch-off-outline]";
	return (
		<Frame presentation="dialog" title={t("manageApproval.webhook.ops.set-enabled.title")} summary={t("manageApproval.webhook.ops.set-enabled.summary")} icon={icon} badge={t("manageApproval.webhook.ops.set-enabled.badge")} labels={frameLabels(request.permission, t("manageApproval.webhook.ops.set-enabled.confirm"))} responding={responding} countdown={approval.countdown.formatted} error={error} onReject={reject} onApprove={() => approve()} canApprove={Boolean(input)}>
			{input ? (<><ApprovalTargetCard icon="icon-[mdi--webhook]" title={endpoint?.name ?? input.id} subtitle={endpoint?.urlMask ?? input.id} rows={[{ label: t("manageApproval.fields.enabled"), value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no") }]} /><ApprovalImpactCard icon={icon} title={t("manageApproval.afterActionTitle")} description={t("manageApproval.webhook.ops.set-enabled.impact")} /></>) : (<ApprovalRawFallback input={request.input} />)}
		</Frame>
	);
}
