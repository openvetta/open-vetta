import { describe, expect, it } from "vitest";
import { getWeightedPetActionIdsForNow } from "./pet-action-selection.js";
import { PET_ACTIONS } from "./pet-actions.js";

const REMOVED_LIFESTYLE_ACTIONS = [
	"stoat_sleep_lie_on_cushion",
	"stoat_listen_music_headphones_nod",
	"stoat_sit_cushion_drink_tea_slow",
	"stoat_stand_lift_barbell_one_hand_fast",
	"stoat_wave_backflip_smoke_fade_exit",
] as const;

describe("desktop pet action rotation", () => {
	it("offers programmer clips on a workday and drops the tailed lifestyle clips", () => {
		const workday = new Date(2026, 8, 22, 11, 0, 0);
		const ids = new Set<string>(getWeightedPetActionIdsForNow(workday));

		for (const actionId of [
			"penguin_nap_on_keyboard",
			"penguin_coffee_sip",
			"penguin_watch_terminal",
			"penguin_commit_success",
			"penguin_ship_deploy",
			"stoat_work_laptop_typing_desk_cushion",
		]) {
			expect(ids.has(actionId)).toBe(true);
		}
		const catalogIds = new Set<string>(PET_ACTIONS.map((action) => action.id));
		for (const actionId of REMOVED_LIFESTYLE_ACTIONS) {
			expect(ids.has(actionId)).toBe(false);
			expect(catalogIds.has(actionId)).toBe(false);
		}
	});
});
