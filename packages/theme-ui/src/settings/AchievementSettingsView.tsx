import type { JSX, ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@vetta/ui";

export interface AchievementSetOptionView {
	readonly id: string;
	readonly label: string;
}

export interface AchievementSettingsViewProps {
	readonly setSelectorLabel: string;
	readonly selectedSetId: string;
	readonly setOptions: readonly AchievementSetOptionView[];
	readonly onSelectSetId: (id: string) => void;
	readonly carousel: ReactNode;
	readonly promotionDialog: ReactNode;
}

export function AchievementSettingsView({
	setSelectorLabel,
	selectedSetId,
	setOptions,
	onSelectSetId,
	carousel,
	promotionDialog,
}: AchievementSettingsViewProps): JSX.Element {
	return (
		<>
			<div className="mx-auto w-full max-w-[920px] px-8 pb-28 pt-4">
				<div className="mb-4 flex items-center justify-end gap-2">
					<span className="text-[12px] text-muted-foreground">{setSelectorLabel}</span>
					<Select value={selectedSetId} onValueChange={onSelectSetId}>
						<SelectTrigger aria-label={setSelectorLabel} className="min-w-40" size="sm">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{setOptions.map((set) => (
								<SelectItem key={set.id} value={set.id}>
									{set.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{carousel}
			</div>
			{promotionDialog}
		</>
	);
}
