import type { SessionEvent } from "../../../../runtime-core/src/index.js";
import type { PetActionId } from "../../shared/pet-actions.js";

export function mapSessionEventToPetAction(event: SessionEvent): PetActionId | null {
	if (event.type === "session.lifecycle") {
		if (event.phase === "agent_start" || event.phase === "turn_start") {
			return "stoat_work_laptop_typing_desk_cushion";
		}
		if (event.phase === "agent_end") {
			return "stoat_stand_lift_barbell_one_hand_fast";
		}
		if (event.phase === "aborted") {
			return "stoat_sleep_lie_on_cushion";
		}
		return null;
	}

	if (event.type === "toolcall.start" || event.type === "tool.start") {
		return "stoat_work_laptop_typing_desk_cushion";
	}

	if (event.type === "thinking.delta" || event.type === "compaction.start" || event.type === "mcp.reload.start") {
		return "stoat_sit_cushion_drink_tea_slow";
	}

	if (event.type === "background_tasks_update") {
		if (event.tasks.some((task) => task.status === "running")) {
			return "stoat_work_laptop_typing_desk_cushion";
		}
		if (event.tasks.some((task) => task.status === "failed" || task.status === "killed")) {
			return "stoat_wave_backflip_smoke_fade_exit";
		}
		if (event.tasks.length > 0 && event.tasks.every((task) => task.status === "completed")) {
			return "stoat_stand_lift_barbell_one_hand_fast";
		}
		return null;
	}

	if (event.type === "error") {
		return "stoat_wave_backflip_smoke_fade_exit";
	}

	return null;
}
