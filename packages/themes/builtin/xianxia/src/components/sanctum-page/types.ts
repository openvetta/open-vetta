import type { SanctumAchievement } from "./achievements";

export interface RealmRequirement {
	readonly current: number;
	readonly icon: string;
	readonly label: string;
	readonly target: number;
}

export interface SanctumCultivationView {
	readonly achievedRealmIds: readonly string[];
	readonly currentPower: number;
	readonly englishName: string;
	readonly growth: readonly {
		readonly label: string;
		readonly value: number;
	}[];
	readonly level: number;
	readonly maxPower: number;
	readonly name: string;
	readonly progressPercent: string;
	readonly realmId: string;
}

export interface RealmDetailView {
	readonly achieved: boolean;
	readonly achievement: SanctumAchievement;
	readonly definition: string;
	readonly nextRealmName: string | null;
	readonly previousRealmName: string | null;
	readonly requirements: readonly RealmRequirement[];
}
