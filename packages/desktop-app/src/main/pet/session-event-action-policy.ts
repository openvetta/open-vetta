import type { SessionEvent } from "../../../../runtime-core/src/index.js";
import { getPetActionsByGroup, type PetActionGroupId, type PetActionId } from "../../shared/pet-actions.js";

type SessionLifecyclePhase = Extract<SessionEvent, { type: "session.lifecycle" }>["phase"];
type BackgroundTasksEvent = Extract<SessionEvent, { type: "background_tasks_update" }>;

interface PetActionIntent {
	readonly groupId: PetActionGroupId;
	readonly actionId?: PetActionId;
}

interface SessionPetActionRule {
	readonly name: string;
	resolve(event: SessionEvent): PetActionIntent | null;
}

const DEFAULT_ACTION_BY_GROUP = {
	idle: "stoat_spin_color_hula_hoop",
	working: "stoat_work_laptop_typing_desk_cushion",
	resting: "stoat_sit_cushion_drink_tea_slow",
	feedback: "stoat_stand_lift_barbell_one_hand_fast",
} satisfies Record<PetActionGroupId, PetActionId>;

const LIFECYCLE_INTENTS: Partial<Record<SessionLifecyclePhase, PetActionIntent>> = {
	agent_start: { groupId: "working" },
	turn_start: { groupId: "working" },
	agent_end: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
	aborted: { groupId: "resting", actionId: "stoat_sleep_lie_on_cushion" },
};

const EVENT_TYPE_INTENTS: Partial<Record<SessionEvent["type"], PetActionIntent>> = {
	"toolcall.start": { groupId: "working" },
	"tool.start": { groupId: "working" },
	"thinking.delta": { groupId: "resting" },
	"compaction.start": { groupId: "resting" },
	"mcp.reload.start": { groupId: "resting" },
	error: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
};

const BACKGROUND_TASK_INTENTS: readonly {
	readonly intent: PetActionIntent;
	matches(event: BackgroundTasksEvent): boolean;
}[] = [
	{
		intent: { groupId: "working" },
		matches: (event) => event.tasks.some((task) => task.status === "running"),
	},
	{
		intent: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
		matches: (event) => event.tasks.some((task) => task.status === "failed" || task.status === "killed"),
	},
	{
		intent: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
		matches: (event) => event.tasks.length > 0 && event.tasks.every((task) => task.status === "completed"),
	},
];

const sessionPetActionRules: readonly SessionPetActionRule[] = [
	{
		name: "session-lifecycle",
		resolve: (event) => (event.type === "session.lifecycle" ? (LIFECYCLE_INTENTS[event.phase] ?? null) : null),
	},
	{
		name: "background-tasks",
		resolve: (event) =>
			event.type === "background_tasks_update"
				? (BACKGROUND_TASK_INTENTS.find((rule) => rule.matches(event))?.intent ?? null)
				: null,
	},
	{
		name: "event-type",
		resolve: (event) => EVENT_TYPE_INTENTS[event.type] ?? null,
	},
];

function resolvePetActionIntent(intent: PetActionIntent): PetActionId {
	return intent.actionId ?? DEFAULT_ACTION_BY_GROUP[intent.groupId] ?? getPetActionsByGroup(intent.groupId)[0].id;
}

export function mapSessionEventToPetAction(event: SessionEvent): PetActionId | null {
	for (const rule of sessionPetActionRules) {
		const intent = rule.resolve(event);
		if (intent) return resolvePetActionIntent(intent);
	}
	return null;
}
