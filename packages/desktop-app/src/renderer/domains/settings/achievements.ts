export interface Achievement {
	id: AchievementId;
	imageUrl: string;
}

export type AchievementId =
	| "awakeningSpark"
	| "redBoatVoyage"
	| "jinggangFire"
	| "longMarch"
	| "yananBeacon"
	| "governanceTest"
	| "constructionGlory"
	| "reformTide"
	| "rejuvenationEpic";

export const ACHIEVEMENTS: readonly Achievement[] = [
	{ id: "awakeningSpark", imageUrl: "./achievements/badge_awakening_spark.png" },
	{ id: "redBoatVoyage", imageUrl: "./achievements/badge_red_boat_voyage.png" },
	{ id: "jinggangFire", imageUrl: "./achievements/badge_jinggang_fire.png" },
	{ id: "longMarch", imageUrl: "./achievements/badge_long_march.png" },
	{ id: "yananBeacon", imageUrl: "./achievements/badge_yanan_beacon.png" },
	{ id: "governanceTest", imageUrl: "./achievements/badge_governance_test.png" },
	{ id: "constructionGlory", imageUrl: "./achievements/badge_construction_glory.png" },
	{ id: "reformTide", imageUrl: "./achievements/badge_reform_tide.png" },
	{ id: "rejuvenationEpic", imageUrl: "./achievements/badge_rejuvenation_epic.png" },
] as const;
