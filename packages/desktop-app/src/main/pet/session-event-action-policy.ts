import type { SessionEvent } from "../../../../runtime-core/src/index.js";
import { getPetActionsByGroup, type PetActionGroupId, type PetActionId } from "../../shared/pet-actions.js";
import type { PetBubblePriority } from "../../shared/pet-ipc.js";

type SessionLifecyclePhase = Extract<SessionEvent, { type: "session.lifecycle" }>["phase"];
type BackgroundTasksEvent = Extract<SessionEvent, { type: "background_tasks_update" }>;

interface PetActionIntent {
	readonly groupId: PetActionGroupId;
	readonly actionId?: PetActionId;
}

export interface PetBubbleIntent {
	readonly text: string;
	readonly ttlMs?: number;
	readonly priority?: PetBubblePriority;
}

interface PetPresentationIntent {
	readonly action?: PetActionIntent;
	readonly bubble?: PetBubbleIntent;
}

export interface PetPresentation {
	readonly actionId?: PetActionId;
	readonly bubble?: PetBubbleIntent;
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

const LIFECYCLE_INTENTS: Partial<Record<SessionLifecyclePhase, PetPresentationIntent>> = {
	agent_start: {
		action: { groupId: "working" },
		bubble: { text: "开始处理", ttlMs: 3_000 },
	},
	turn_start: {
		action: { groupId: "working" },
		bubble: { text: "我开始工作了", ttlMs: 3_000 },
	},
	agent_end: {
		action: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
		bubble: { text: "处理完成", ttlMs: 4_000 },
	},
	aborted: {
		action: { groupId: "resting", actionId: "stoat_sleep_lie_on_cushion" },
		bubble: { text: "已暂停", ttlMs: 4_000 },
	},
};

const EVENT_TYPE_INTENTS: Partial<Record<SessionEvent["type"], PetPresentationIntent>> = {
	"toolcall.start": {
		action: { groupId: "working" },
		bubble: { text: "正在调用工具", ttlMs: 3_000 },
	},
	"tool.start": {
		action: { groupId: "working" },
		bubble: { text: "正在执行工具", ttlMs: 3_000 },
	},
	"thinking.delta": {
		action: { groupId: "resting" },
		bubble: { text: "我在思考", ttlMs: 3_000 },
	},
	"compaction.start": {
		action: { groupId: "resting" },
		bubble: { text: "整理上下文", ttlMs: 3_000 },
	},
	"mcp.reload.start": {
		action: { groupId: "resting" },
		bubble: { text: "刷新工具中", ttlMs: 3_000 },
	},
	error: {
		action: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
		bubble: { text: "遇到错误", ttlMs: 5_000, priority: "high" },
	},
};

const BACKGROUND_TASK_INTENTS: readonly {
	readonly intent: PetPresentationIntent;
	matches(event: BackgroundTasksEvent): boolean;
}[] = [
	{
		intent: {
			action: { groupId: "working" },
			bubble: { text: "后台任务运行中", ttlMs: 3_000 },
		},
		matches: (event) => event.tasks.some((task) => task.status === "running"),
	},
	{
		intent: {
			action: { groupId: "feedback", actionId: "stoat_wave_backflip_smoke_fade_exit" },
			bubble: { text: "后台任务失败", ttlMs: 5_000, priority: "high" },
		},
		matches: (event) => event.tasks.some((task) => task.status === "failed" || task.status === "killed"),
	},
	{
		intent: {
			action: { groupId: "feedback", actionId: "stoat_stand_lift_barbell_one_hand_fast" },
			bubble: { text: "后台任务完成", ttlMs: 4_000 },
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

function resolvePetPresentationIntent(intent: PetPresentationIntent): PetPresentation {
	return {
		actionId: intent.action ? resolvePetActionIntent(intent.action) : undefined,
		bubble: intent.bubble,
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
