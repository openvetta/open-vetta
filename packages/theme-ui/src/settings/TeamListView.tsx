import type { JSX } from "react";
import { SettingSection, type SettingSectionMeta } from "./SettingChrome";

export interface TeamListItemView {
	readonly id: number;
	readonly name: string;
	readonly roleLabel: string;
}

export interface TeamListViewProps {
	readonly teams: readonly TeamListItemView[];
	readonly loading: boolean;
	readonly emptyLabel: string;
	readonly section: SettingSectionMeta;
	readonly onSelect: (id: number) => void;
}

export function TeamListView({
	teams,
	loading,
	emptyLabel,
	section,
	onSelect,
}: TeamListViewProps): JSX.Element {
	if (teams.length === 0) {
		return (
			<SettingSection section={section}>
				<div className="px-5 py-8 text-center text-[13px] text-muted-foreground">{emptyLabel}</div>
			</SettingSection>
		);
	}

	return (
		<SettingSection section={section}>
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
							<div className="text-[11px] text-muted-foreground">{team.roleLabel}</div>
						</div>
					</div>
					<span className="icon-[mdi--chevron-right] h-4 w-4 text-muted-foreground/50" />
				</button>
			))}
		</SettingSection>
	);
}
