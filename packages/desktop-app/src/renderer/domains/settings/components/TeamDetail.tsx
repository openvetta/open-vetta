import { useState } from "react";
import type { TeamDetailVO } from "@shared/lib/api";
import { Button } from "@shared/components/ui/button";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import type { TeamSettingsLabels } from "./useTeamSettingsModel";

export function TeamDetail({
	detail,
	labels,
	onBack,
	onResetCode,
	onRemoveMember,
	onLeave,
}: {
	detail: TeamDetailVO;
	labels: TeamSettingsLabels;
	onBack: () => void;
	onResetCode: () => Promise<void>;
	onRemoveMember: (userId: number) => Promise<void>;
	onLeave: () => Promise<void>;
}): JSX.Element {
	const [copied, setCopied] = useState(false);

	const handleCopyInviteCode = async () => {
		await navigator.clipboard.writeText(detail.invite_code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="space-y-4">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
			>
				<span className="icon-[mdi--arrow-left] h-3.5 w-3.5" />
				{labels.backToList}
			</button>

			<SettingSection section={SETTINGS_SECTION["team-detail-info"]} title={detail.name}>
				<div className="flex items-center justify-between border-b border-border px-5 py-3.5">
					<div>
						<div className="text-[13px] font-medium text-foreground">{labels.codeLabel}</div>
						<div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail.invite_code}</div>
					</div>
					<div className="flex gap-1.5">
						<Button variant="ghost" size="xs" onClick={handleCopyInviteCode}>
							{copied ? (
								<span className="icon-[mdi--check] h-3.5 w-3.5 text-emerald-400" />
							) : (
								<span className="icon-[mdi--content-copy] h-3.5 w-3.5" />
							)}
						</Button>
						<Button variant="ghost" size="xs" onClick={onResetCode} title={labels.resetCode}>
							<span className="icon-[mdi--refresh] h-3.5 w-3.5" />
						</Button>
					</div>
				</div>

				<div className="flex items-center justify-between px-5 py-3.5">
					<div className="text-[13px] font-medium text-foreground">{labels.members}</div>
					<div className="text-[12px] text-muted-foreground">{labels.memberCount(detail.members.length)}</div>
				</div>
			</SettingSection>

			<SettingSection section={SETTINGS_SECTION["team-members"]}>
				{detail.members.map((member, i) => (
					<div
						key={member.id}
						className={`flex items-center justify-between px-5 py-3 ${i < detail.members.length - 1 ? "border-b border-border" : ""}`}
					>
						<div className="flex items-center gap-3">
							{member.avatar ? (
								<img src={member.avatar} alt="" className="h-7 w-7 rounded-full" />
							) : (
								<div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-muted-foreground">
									{member.username[0]}
								</div>
							)}
							<div>
								<span className="text-[13px] text-foreground">{member.username}</span>
								<span className="ml-2 text-[11px] text-muted-foreground">{memberRoleLabel(member.role, labels)}</span>
							</div>
						</div>
						{member.role !== "owner" && (
							<Button
								variant="ghost"
								size="xs"
								className="text-muted-foreground hover:text-destructive"
								onClick={() => onRemoveMember(member.user_id)}
							>
								<span className="icon-[mdi--close] h-3.5 w-3.5" />
							</Button>
						)}
					</div>
				))}
			</SettingSection>

			{detail.members.some((member) => member.role !== "owner") && (
				<div className="flex justify-end">
					<Button variant="outline" size="sm" className="text-destructive" onClick={onLeave} />
				</div>
			)}
		</div>
	);
}

function memberRoleLabel(role: TeamDetailVO["members"][number]["role"], labels: TeamSettingsLabels): string {
	if (role === "owner") return labels.ownerRole;
	if (role === "admin") return labels.adminRole;
	return labels.memberRole;
}
