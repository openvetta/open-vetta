import { useMemo, useState } from "react";
import { Switch } from "../../../components/ui/switch";
import { type ActiveActionApproval, useActionApproval } from "../../useActionApproval";
import {
	experimentalFieldLabel,
	isExperimentalFieldKey,
	type ExperimentalFieldKey,
} from "../../approvalCopy";
import {
	ApprovalImpactCard,
	ApprovalRawFallback,
	ApprovalSettingGroup,
	ApprovalSettingRow,
} from "../ApprovalParts";
import { useManageApprovalFrame } from "../useManageApprovalShell";

interface InputData {
	operation: "set-experimental";
	data: Partial<Record<ExperimentalFieldKey, boolean>>;
	approvalUi?: string;
}

function parseInput(input: unknown): InputData | null {
	if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
	const r = input as Record<string, unknown>;
	if (r.operation !== "set-experimental" || typeof r.data !== "object" || r.data === null || Array.isArray(r.data)) {
		return null;
	}
	const data: Partial<Record<ExperimentalFieldKey, boolean>> = {};
	for (const [key, value] of Object.entries(r.data as Record<string, unknown>)) {
		if (isExperimentalFieldKey(key) && typeof value === "boolean") {
			data[key] = value;
		}
	}
	if (Object.keys(data).length === 0) return null;
	return {
		operation: "set-experimental",
		data,
		approvalUi: typeof r.approvalUi === "string" ? r.approvalUi : undefined,
	};
}

function experimentalFieldDescription(
	t: ReturnType<typeof useManageApprovalFrame>["t"],
	key: ExperimentalFieldKey,
): string {
	return t(`manageApproval.settings.experimentalFields.${key}Desc`);
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
	const initial = useMemo(() => input?.data ?? {}, [input]);
	const [data, setData] = useState(initial);
	const keys = Object.keys(data) as ExperimentalFieldKey[];

	return (
		<Frame
			presentation="drawer"
			title={t("manageApproval.settings.ops.set-experimental.title")}
			summary={t("manageApproval.settings.ops.set-experimental.summary")}
			icon="icon-[mdi--flask-outline]"
			badge={t("manageApproval.settings.ops.set-experimental.badge")}
			labels={frameLabels(request.permission, t("manageApproval.settings.ops.set-experimental.confirm"))}
			responding={responding}
			countdown={approval.countdown.formatted}
			error={error}
			onReject={reject}
			onApprove={() =>
				input
					? approve({
							operation: "set-experimental",
							data,
							approvalUi: input.approvalUi ?? "settings.set-experimental",
						})
					: approve()
			}
			canApprove={Boolean(input) && keys.length > 0}
		>
			{input ? (
				<>
					<ApprovalSettingGroup
						title={t("manageApproval.settings.experimentalSectionTitle")}
						description={t("manageApproval.settings.experimentalSectionDescription")}
					>
						{keys.map((key, index) => {
							const value = Boolean(data[key]);
							return (
								<ApprovalSettingRow
									key={key}
									title={experimentalFieldLabel(t, key)}
									description={experimentalFieldDescription(t, key)}
									border={index < keys.length - 1}
								>
									<div className="flex items-center gap-2">
										<span
											className={
												value
													? "text-[11px] font-medium text-primary"
													: "text-[11px] font-medium text-muted-foreground"
											}
										>
											{value ? t("manageApproval.on") : t("manageApproval.off")}
										</span>
										<Switch
											checked={value}
											onCheckedChange={(checked) =>
												setData((prev) => ({
													...prev,
													[key]: checked,
												}))
											}
										/>
									</div>
								</ApprovalSettingRow>
							);
						})}
					</ApprovalSettingGroup>
					<ApprovalImpactCard
						icon="icon-[mdi--flask-outline]"
						title={t("manageApproval.afterActionTitle")}
						description={t("manageApproval.settings.ops.set-experimental.impact")}
					/>
				</>
			) : (
				<ApprovalRawFallback input={request.input} />
			)}
		</Frame>
	);
}
