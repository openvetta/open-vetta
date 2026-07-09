import { Button } from "@shared/components/ui/button";
import { SettingHeading } from "./shared";
import { SETTINGS_SECTION } from "../registry";
import { CreateTeamDialog, JoinTeamDialog } from "./TeamDialogs";
import { TeamDetail } from "./TeamDetail";
import { TeamList } from "./TeamList";
import type { TeamSettingsModel } from "./useTeamSettingsModel";

export function TeamSettingsView({ model }: { model: TeamSettingsModel }): JSX.Element {
	if (!model.token) {
		return <div className="p-6 text-center text-[13px] text-muted-foreground">{model.labels.loginRequired}</div>;
	}

	return (
		<div className="mx-auto w-full max-w-2xl space-y-6 px-8 pb-12">
			<div className="flex items-center justify-between">
				<div>
					<SettingHeading section={SETTINGS_SECTION["team-management"]} className="text-[18px] font-bold" />
					<p className="mt-1 text-[12px] text-muted-foreground">{model.labels.description}</p>
				</div>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={() => model.setJoinOpen(true)}>
						<span className="icon-[mdi--account-plus-outline] mr-1.5 h-3.5 w-3.5" />
					</Button>
					<Button size="sm" onClick={() => model.setCreateOpen(true)}>
						<span className="icon-[mdi--plus] mr-1.5 h-3.5 w-3.5" />
					</Button>
				</div>
			</div>

			{model.selectedTeam ? (
				<TeamDetail
					detail={model.selectedTeam}
					labels={model.labels}
					onBack={model.onBack}
					onResetCode={model.onResetInviteCode}
					onRemoveMember={model.onRemoveMember}
					onLeave={model.onLeaveTeam}
				/>
			) : (
				<TeamList
					teams={model.teams}
					loading={model.loading}
					labels={model.labels}
					onSelect={model.onSelectTeam}
				/>
			)}

			<CreateTeamDialog
				open={model.createOpen}
				labels={model.labels}
				onOpenChange={model.setCreateOpen}
				onCreate={model.onCreateTeam}
			/>
			<JoinTeamDialog
				open={model.joinOpen}
				labels={model.labels}
				onOpenChange={model.setJoinOpen}
				onJoin={model.onJoinTeam}
			/>
		</div>
	);
}
