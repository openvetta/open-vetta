import { useThemeStorage, type ThemeStorageValue } from "@vetta/theme-sdk";
import { useSyncExternalStore } from "react";
import { CULTIVATION_REALMS, CULTIVATION_STORAGE_KEY, type CultivationSnapshot } from "../../cultivation";
import type { SanctumCultivationView } from "./types";

const fallbackRealm = CULTIVATION_REALMS[0];

const fallbackCultivationView: SanctumCultivationView = {
	achievedRealmIds: [fallbackRealm.id],
	currentPower: 0,
	englishName: fallbackRealm.englishName,
	growth: [
		{ label: "今日", value: 0 },
		{ label: "本周", value: 0 },
		{ label: "近30天", value: 0 },
	],
	level: fallbackRealm.level,
	maxPower: CULTIVATION_REALMS[1]?.targetScore ?? 0,
	name: fallbackRealm.name,
	progressPercent: "0%",
	realmId: fallbackRealm.id,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readCultivationSnapshot(value: ThemeStorageValue | undefined): CultivationSnapshot | null {
	if (!isRecord(value)) return null;
	if (value.version !== 3) return null;
	if (typeof value.realmId !== "string") return null;
	if (typeof value.level !== "number") return null;
	if (typeof value.name !== "string") return null;
	if (typeof value.englishName !== "string") return null;
	if (typeof value.cultivationPower !== "number") return null;
	if (typeof value.cultivationPowerTarget !== "number") return null;
	if (typeof value.progressToNext !== "number") return null;
	if (!Array.isArray(value.achievedRealmIds)) return null;
	if (!isRecord(value.growth)) return null;

	return value as unknown as CultivationSnapshot;
}

function useCultivationSnapshot(): CultivationSnapshot | null {
	const storage = useThemeStorage();

	useSyncExternalStore(
		storage.subscribe,
		() => `${storage.status}:${JSON.stringify(storage.get(CULTIVATION_STORAGE_KEY))}`,
		() => "loading:",
	);

	if (storage.status !== "ready") return null;
	return readCultivationSnapshot(storage.get(CULTIVATION_STORAGE_KEY));
}

function toCultivationView(snapshot: CultivationSnapshot | null): SanctumCultivationView {
	if (!snapshot) return fallbackCultivationView;
	const maxPower =
		snapshot.cultivationPowerTarget > 0
			? snapshot.cultivationPowerTarget
			: Math.max(snapshot.cultivationPower, 1);

	return {
		achievedRealmIds: snapshot.achievedRealmIds,
		currentPower: snapshot.cultivationPower,
		englishName: snapshot.englishName,
		growth: [
			{ label: "今日", value: snapshot.growth.today },
			{ label: "本周", value: snapshot.growth.thisWeek },
			{ label: "近30天", value: snapshot.growth.last30Days },
		],
		level: snapshot.level,
		maxPower,
		name: snapshot.name,
		progressPercent: `${Math.round(snapshot.progressToNext * 100)}%`,
		realmId: snapshot.realmId,
	};
}

export function useSanctumCultivationView(): SanctumCultivationView {
	return toCultivationView(useCultivationSnapshot());
}

export function formatCultivationNumber(value: number): string {
	return Math.floor(value).toLocaleString("en-US");
}

export function formatRealmTitle(name: string): string {
	return name.split("").join(" ");
}
