import type { CornerImageFrameDecoration } from "@shared/components/CornerImageFrame";

export interface Achievement {
	frameDecoration: CornerImageFrameDecoration;
	frameUrl: string;
	id: AchievementId;
	imageUrl: string;
	targetActiveMs: number;
	surfaceColors: {
		backgroundColor: string;
		borderColor: string;
	};
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
	{
		id: "awakeningSpark",
		targetActiveMs: 0,
		imageUrl: "./achievements/badge_awakening_spark.png",
		frameUrl: "./achievements/frame_awakening_spark.webp",
		surfaceColors: { backgroundColor: "#2b211a", borderColor: "#9a714c" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-28px", top: "-26px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-16px", top: "-26px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-34px", left: "-28px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-32px", right: "-16px" } },
			],
		},
	},
	{
		id: "redBoatVoyage",
		targetActiveMs: 10 * 60 * 1000,
		imageUrl: "./achievements/badge_red_boat_voyage.png",
		frameUrl: "./achievements/frame_red_boat_voyage.webp",
		surfaceColors: { backgroundColor: "#2f1f18", borderColor: "#a86943" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-28px", top: "-49px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-26px", top: "-49px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-36px", left: "-27px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-37px", right: "-24px" } },
			],
		},
	},
	{
		id: "jinggangFire",
		targetActiveMs: 60 * 60 * 1000,
		imageUrl: "./achievements/badge_jinggang_fire.png",
		frameUrl: "./achievements/frame_jinggang_fire.webp",
		surfaceColors: { backgroundColor: "#281f1a", borderColor: "#916c4a" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-20px", top: "-19px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-20px", top: "-19px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-22px", left: "-20px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-22px", right: "-19px" } },
			],
		},
	},
	{
		id: "longMarch",
		targetActiveMs: 3 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_long_march.png",
		frameUrl: "./achievements/frame_long_march.webp",
		surfaceColors: { backgroundColor: "#29221e", borderColor: "#8c6f62" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-27px", top: "-28px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-22px", top: "-28px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-31px", left: "-33px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-32px", right: "-21px" } },
			],
		},
	},
	{
		id: "yananBeacon",
		targetActiveMs: 8 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_yanan_beacon.png",
		frameUrl: "./achievements/frame_yanan_beacon.webp",
		surfaceColors: { backgroundColor: "#2b1f18", borderColor: "#946843" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-19px", top: "-25px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-20px", top: "-25px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-25px", left: "-23px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-35px", right: "-23px" } },
			],
		},
	},
	{
		id: "governanceTest",
		targetActiveMs: 20 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_governance_test.png",
		frameUrl: "./achievements/frame_governance_test.webp",
		surfaceColors: { backgroundColor: "#261c18", borderColor: "#865f43" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-28px", top: "-27px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-23px", top: "-27px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-32px", left: "-31px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-32px", right: "-32px" } },
			],
		},
	},
	{
		id: "constructionGlory",
		targetActiveMs: 50 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_construction_glory.png",
		frameUrl: "./achievements/frame_construction_glory.webp",
		surfaceColors: { backgroundColor: "#2c211b", borderColor: "#9a6c4e" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-29px", top: "-30px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-24px", top: "-31px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-29px", left: "-30px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-30px", right: "-27px" } },
			],
		},
	},
	{
		id: "reformTide",
		targetActiveMs: 100 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_reform_tide.png",
		frameUrl: "./achievements/frame_reform_tide.webp",
		surfaceColors: { backgroundColor: "#2d2119", borderColor: "#9f6f44" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-25px", top: "-35px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-20px", top: "-36px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-32px", left: "-24px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-29px", right: "-29px" } },
			],
		},
	},
	{
		id: "rejuvenationEpic",
		targetActiveMs: 500 * 60 * 60 * 1000,
		imageUrl: "./achievements/badge_rejuvenation_epic.png",
		frameUrl: "./achievements/frame_rejuvenation_epic.webp",
		surfaceColors: { backgroundColor: "#33231b", borderColor: "#b47b55" },
		frameDecoration: {
			cornerWidth: "7rem",
			cornerHeight: "7rem",
			backgroundSize: "14rem 14rem",
			corners: [
				{ id: "top-left", backgroundPosition: "0% 0%", position: { left: "-21px", top: "-27px" } },
				{ id: "top-right", backgroundPosition: "100% 0%", position: { right: "-22px", top: "-24px" } },
				{ id: "bottom-left", backgroundPosition: "0% 100%", position: { bottom: "-28px", left: "-22px" } },
				{ id: "bottom-right", backgroundPosition: "100% 100%", position: { bottom: "-29px", right: "-30px" } },
			],
		},
	},
] as const;
