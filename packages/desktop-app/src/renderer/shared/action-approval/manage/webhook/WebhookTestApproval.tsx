import type { WebhookEndpointPublic } from "@preload/api.js";
import { useEffect, useState } from "react";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import { ApprovalImpactCard, ApprovalRawFallback, ApprovalTargetCard } from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";
interface InputData { operation: "test"; id: string; }
function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "test" || typeof r.id !== "string") return null;
	return { operation: "test", id: r.id };
}
export function WebhookTestApproval(): JSX.Element | null {
	const approval = useActionApproval("webhook.test");
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
		<Frame presentation="dialog" title={t("manageApproval.webhook.ops.test.title")} summary={t("manageApproval.webhook.ops.test.summary")} icon="icon-[mdi--test-tube]" badge={t("manageApproval.webhook.ops.test.badge")} labels={frameLabels(request.permission, t("manageApproval.webhook.ops.test.confirm"))} responding={responding} countdown={approval.countdown.formatted} error={error} onReject={reject} onApprove={() => approve()} canApprove={Boolean(input)}>
			{input ? (<><ApprovalTargetCard icon="icon-[mdi--webhook]" title={endpoint?.name ?? input.id} subtitle={endpoint?.urlMask ?? input.id} /><ApprovalImpactCard icon="icon-[mdi--test-tube]" title={t("manageApproval.afterActionTitle")} description={t("manageApproval.webhook.ops.test.impact")} /></>) : (<ApprovalRawFallback input={request.input} />)}
		</Frame>
	);
}
