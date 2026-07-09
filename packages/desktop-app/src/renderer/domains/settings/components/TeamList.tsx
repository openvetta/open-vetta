import type { TeamVO } from "@shared/lib/api";
import { SettingSection } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import type { TeamSettingsLabels } from "./useTeamSettingsModel";

export function TeamList({
	teams,
	loading,
	labels,
	onSelect,
}: {
	teams: TeamVO[];
	loading: boolean;
	labels: TeamSettingsLabels;
	onSelect: (id: number) => void;
}): JSX.Element {
	if (teams.length === 0) {
		return (
			<SettingSection section={SETTINGS_SECTION["team-my-teams"]}>
				<div className="px-5 py-8 text-center text-[13px] text-muted-foreground">{labels.joinViaCode}</div>
			</SettingSection>
		);
	}

	return (
		<SettingSection section={SETTINGS_SECTION["team-my-teams"]}>
			{teams.map((team, i) => (
				<button
					key={team.id}
					type="button"
					onClick={() => onSelect(team.id)}
					className={`flex w-full items-center justify-between px-5 py-3.5 text-left transition-colors hover:bg-accent/50 ${i < teams.length - 1 ? "border-b border-border" : ""}`}
					disabled={loading}
				>
					<div className="flex items-center gap-3">
						<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-[13px] font-bold text-primary">
							{team.name[0]}
						</div>
						<div>
							<div className="text-[13px] font-medium text-foreground">{team.name}</div>
							<div className="text-[11px] text-muted-foreground">{roleLabel(team.role, labels)}</div>
						</div>
					</div>
					<span className="icon-[mdi--chevron-right] h-4 w-4 text-muted-foreground/50" />
				</button>
			))}
		</SettingSection>
	);
}

function roleLabel(role: TeamVO["role"], labels: TeamSettingsLabels): string {
	if (role === "owner") return labels.ownerRole;
	if (role === "admin") return labels.adminRole;
	return labels.memberRole;
}
