import { readCodingAgentBackgroundTasksObservation } from "@vetta/coding-agent/session-extensions";
import type { SessionEvent } from "@vetta/runtime-core";
import type { BackgroundCommandSnapshot } from "@vetta/runtime-tools";
import { getPetActionsByGroup, type PetActionGroupId, type PetActionId } from "../../shared/pet-actions.js";
import type { PetActivityState } from "../../shared/pet-ipc.js";

type SessionLifecyclePhase = Extract<SessionEvent, { type: "session.lifecycle" }>["phase"];
interface BackgroundTasksEvent {
	readonly tasks: readonly BackgroundCommandSnapshot[];
}

interface PetActionIntent {
	readonly groupId: PetActionGroupId;
	readonly actionId?: PetActionId;
}

interface PetPresentationIntent {
	readonly state?: PetActivityState;
	readonly action?: PetActionIntent;
}

export interface PetPresentation {
	readonly state?: PetActivityState;
	readonly actionId?: PetActionId;
}

interface SessionPetActionRule {
	readonly name: string;
	resolve(event: SessionEvent): PetPresentationIntent | null;
}

const DEFAULT_ACTION_BY_GROUP = {
	idle: "stoat_spin_color_hula_hoop",
	working: "stoat_work_laptop_typing_desk_cushion",
	resting: "stoat_sit_cushion_drink_tea_slow",
	feedback: "stoat_stand_lift_barbell_one_hand_fast",
} satisfies Record<PetActionGroupId, PetActionId>;

const ACTION_BY_STATE = {
	idle: "stoat_spin_color_hula_hoop",
	thinking: "stoat_work_laptop_typing_desk_cushion",
	working: "stoat_work_laptop_typing_desk_cushion",
	waiting_input: "stoat_sit_cushion_drink_tea_slow",
	success: "stoat_stand_lift_barbell_one_hand_fast",
	error: "stoat_wave_backflip_smoke_fade_exit",
	paused: "stoat_sleep_lie_on_cushion",
} satisfies Record<PetActivityState, PetActionId>;

const LIFECYCLE_INTENTS: Partial<Record<SessionLifecyclePhase, PetPresentationIntent>> = {
	agent_start: {
		state: "thinking",
		action: { groupId: "working" },
	},
	agent_end: {
		state: "success",
		action: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
	},
	aborted: {
		state: "paused",
		action: { groupId: "resting", actionId: "stoat_sleep_lie_on_cushion" },
	},
};

const EVENT_TYPE_INTENTS: Partial<Record<SessionEvent["type"], PetPresentationIntent>> = {
	"compaction.start": {
		state: "thinking",
		action: { groupId: "resting" },
	},
	error: {
		state: "error",
		action: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
	},
};

const BACKGROUND_TASK_INTENTS: readonly {
	readonly intent: PetPresentationIntent;
	matches(event: BackgroundTasksEvent): boolean;
}[] = [
	{
		intent: {
			state: "working",
			action: { groupId: "working" },
		},
		matches: (event) => event.tasks.some((task) => task.status === "running"),
	},
	{
		intent: {
			state: "error",
			action: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
		},
		matches: (event) => event.tasks.some((task) => task.status === "failed" || task.status === "killed"),
	},
	{
		intent: {
			state: "success",
			action: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
		},
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
		resolve: (event) => {
			const tasks = readCodingAgentBackgroundTasksObservation(event);
			return tasks ? (BACKGROUND_TASK_INTENTS.find((rule) => rule.matches({ tasks }))?.intent ?? null) : null;
		},
	},
	{
		name: "tool-start",
		resolve: (event) =>
			event.type === "tool.start"
				? {
						state: "working",
						action: { groupId: "working" },
					}
				: null,
	},
	{
		name: "tool-phase",
		resolve: (event) =>
			event.type === "tool.phase"
				? {
						state: "working",
						action: { groupId: "working" },
					}
				: null,
	},
	{
		name: "tool-end",
		resolve: (event) =>
			event.type === "tool.end"
				? {
						state: event.isError ? "error" : "working",
						action: { groupId: event.isError ? "feedback" : "working" },
					}
				: null,
	},
	{
		name: "retry",
		resolve: (event) =>
			event.type === "retry.start"
				? {
						state: "working",
						action: { groupId: "working" },
					}
				: null,
	},
	{
		name: "thinking-phase",
		resolve: (event) =>
			(event.type === "session.lifecycle" && event.phase === "turn_start") || event.type === "model.request.started"
				? { state: "thinking", action: { groupId: "working" } }
				: null,
	},
	{
		name: "event-type",
		resolve: (event) => {
			if (event.channel === "assistant") return null;
			return EVENT_TYPE_INTENTS[event.type] ?? null;
		},
	},
];

function resolvePetActionIntent(intent: PetActionIntent): PetActionId {
	return intent.actionId ?? DEFAULT_ACTION_BY_GROUP[intent.groupId] ?? getPetActionsByGroup(intent.groupId)[0].id;
}

function resolvePetPresentationIntent(intent: PetPresentationIntent): PetPresentation {
	return {
		...(intent.state ? { state: intent.state } : {}),
		...(intent.action ? { actionId: resolvePetActionIntent(intent.action) } : {}),
	};
}

export function createPetStatePresentation(
	state: PetActivityState,
): PetPresentation & { state: PetActivityState; actionId: PetActionId } {
	return {
		state,
		actionId: ACTION_BY_STATE[state],
	};
}

export function mapSessionEventToPetPresentation(event: SessionEvent): PetPresentation | null {
	for (const rule of sessionPetActionRules) {
		const intent = rule.resolve(event);
		if (intent) return resolvePetPresentationIntent(intent);
	}
	return null;
}

export function mapSessionEventToPetAction(event: SessionEvent): PetActionId | null {
	return mapSessionEventToPetPresentation(event)?.actionId ?? null;
}
