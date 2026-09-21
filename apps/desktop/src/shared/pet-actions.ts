export const PET_ACTION_GROUPS = [
	{ id: "idle", label: "待机" },
	{ id: "working", label: "工作" },
	{ id: "resting", label: "休息" },
	{ id: "feedback", label: "反馈" },
] as const;

export type PetActionGroupId = (typeof PET_ACTION_GROUPS)[number]["id"];

export interface PetActionDurationRange {
	minMs: number;
	maxMs: number;
}

function definePetAction<const TId extends string>(action: {
	id: TId;
	groupId: PetActionGroupId;
	label: string;
	description: string;
	videoBaseSize: number;
	autoDuration: PetActionDurationRange;
}): {
	id: TId;
	fileName: `${TId}.webm`;
	groupId: PetActionGroupId;
	label: string;
	description: string;
	videoBaseSize: number;
	autoDuration: PetActionDurationRange;
} {
	return {
		...action,
		fileName: `${action.id}.webm`,
	};
}

export const PET_ACTIONS = [
	definePetAction({
		id: "stoat_sleep_lie_on_cushion",
		groupId: "resting",
		label: "睡觉",
		description: "长时间空闲、深夜或低打扰状态",
		videoBaseSize: 200,
		autoDuration: { minMs: 180_000, maxMs: 300_000 },
	}),
	definePetAction({
		id: "stoat_stand_lift_barbell_one_hand_fast",
		groupId: "feedback",
		label: "举杠铃",
		description: "短休、任务完成后的积极反馈",
		videoBaseSize: 200,
		autoDuration: { minMs: 35_000, maxMs: 70_000 },
	}),
	definePetAction({
		id: "stoat_work_laptop_typing_desk_cushion",
		groupId: "working",
		label: "敲键盘",
		description: "工作时段、用户正在编码或应用处于活跃状态",
		videoBaseSize: 220,
		autoDuration: { minMs: 90_000, maxMs: 180_000 },
	}),
	definePetAction({
		id: "stoat_listen_music_headphones_nod",
		groupId: "resting",
		label: "听音乐",
		description: "晚间、放松或非专注状态",
		videoBaseSize: 200,
		autoDuration: { minMs: 80_000, maxMs: 160_000 },
	}),
	definePetAction({
		id: "stoat_spin_color_hula_hoop",
		groupId: "idle",
		label: "转呼啦圈",
		description: "普通待机中的活泼动作",
		videoBaseSize: 200,
		autoDuration: { minMs: 35_000, maxMs: 70_000 },
	}),
	definePetAction({
		id: "stoat_skip_rope_jump",
		groupId: "idle",
		label: "跳绳",
		description: "久坐提醒、短暂活动提示",
		videoBaseSize: 220,
		autoDuration: { minMs: 30_000, maxMs: 60_000 },
	}),
	definePetAction({
		id: "stoat_sit_cushion_drink_tea_slow",
		groupId: "resting",
		label: "喝茶",
		description: "休息、等待模型响应或低强度待机",
		videoBaseSize: 220,
		autoDuration: { minMs: 60_000, maxMs: 120_000 },
	}),
	definePetAction({
		id: "stoat_wave_backflip_smoke_fade_exit",
		groupId: "feedback",
		label: "再见",
		description: "普通待机中的短动作反馈",
		videoBaseSize: 200,
		autoDuration: { minMs: 20_000, maxMs: 40_000 },
	}),
	definePetAction({
		id: "penguin_debug_scratch_laptop",
		groupId: "working",
		label: "抓头排错",
		description: "对着报错抓头、排查问题",
		videoBaseSize: 220,
		autoDuration: { minMs: 60_000, maxMs: 120_000 },
	}),
	definePetAction({
		id: "penguin_wait_for_compile",
		groupId: "resting",
		label: "等编译",
		description: "等待编译、安装或模型响应",
		videoBaseSize: 220,
		autoDuration: { minMs: 50_000, maxMs: 100_000 },
	}),
	definePetAction({
		id: "penguin_rubber_duck",
		groupId: "working",
		label: "小黄鸭",
		description: "对着小黄鸭讲代码、理清思路",
		videoBaseSize: 220,
		autoDuration: { minMs: 50_000, maxMs: 90_000 },
	}),
	definePetAction({
		id: "penguin_tests_passed_cheer",
		groupId: "feedback",
		label: "测试全绿",
		description: "测试通过、任务完成后的庆祝",
		videoBaseSize: 200,
		autoDuration: { minMs: 25_000, maxMs: 50_000 },
	}),
	definePetAction({
		id: "penguin_review_facepalm",
		groupId: "feedback",
		label: "捂脸",
		description: "报错、复盘翻车时的无奈",
		videoBaseSize: 220,
		autoDuration: { minMs: 25_000, maxMs: 50_000 },
	}),
] as const;

export type PetActionId = (typeof PET_ACTIONS)[number]["id"];

export function getPetActionsByGroup(groupId: PetActionGroupId): readonly (typeof PET_ACTIONS)[number][] {
	return PET_ACTIONS.filter((action) => action.groupId === groupId);
}

export function getPetActionById(actionId: PetActionId): (typeof PET_ACTIONS)[number] {
	return PET_ACTIONS.find((action) => action.id === actionId) ?? PET_ACTIONS[0];
}
