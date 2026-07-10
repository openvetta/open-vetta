import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalTargetCard,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface Input { operation: "set-notifications"; enabled: boolean; }

function parseInput(input: unknown): Input | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-notifications") return null;
	return r as unknown as Input;
}

export function SettingsSetNotificationsApproval(): JSX.Element | null {
	const approval = useActionApproval("settings.set-notifications");
	if (!approval) return null;
	return <SettingsSetNotificationsApprovalContent key={approval.request.approvalId} approval={approval} />;
}

function SettingsSetNotificationsApprovalContent({ approval }: { approval: ActiveActionApproval }): JSX.Element {
	const { Frame, t, frameLabels } = useManageApprovalFrame();
	const { request, responding, error, approve, reject } = approval;
	const input = parseInput(request.input);
	const icon = "icon-[mdi--bell-outline]";

	return (
		<Frame
			presentation="dialog"
			title={t("manageApproval.settings.ops.set-notifications.title")}
			summary={t("manageApproval.settings.ops.set-notifications.summary")}
			icon={icon}
			badge={t("manageApproval.settings.ops.set-notifications.badge")}
			labels={frameLabels(request.permission, t("manageApproval.settings.ops.set-notifications.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() => approve()}
			canApprove={Boolean(input)}
		>
			{input ? (
				<>
					<ApprovalTargetCard icon="icon-[mdi--bell-outline]" title={input.enabled ? t("manageApproval.settings.notificationsOn") : t("manageApproval.settings.notificationsOff")} rows={[{ label: t("manageApproval.fields.enabled"), value: input.enabled ? t("manageApproval.yes") : t("manageApproval.no") }]} />
					<ApprovalImpactCard
						icon={icon}
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.settings.ops.set-notifications.impact")}
						
					/>
					
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
