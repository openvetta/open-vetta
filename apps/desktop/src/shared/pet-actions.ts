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
		id: "penguin_nap_on_keyboard",
		groupId: "resting",
		label: "趴键盘",
		description: "会话中止、深夜或发呆打盹",
		videoBaseSize: 220,
		autoDuration: { minMs: 180_000, maxMs: 300_000 },
	}),
	definePetAction({
		id: "penguin_commit_success",
		groupId: "feedback",
		label: "提交成功",
		description: "举起写着对勾的电脑，表示提交完成",
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
		id: "penguin_watch_terminal",
		groupId: "resting",
		label: "看日志",
		description: "看着终端日志慢慢点头",
		videoBaseSize: 220,
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
		id: "penguin_coffee_sip",
		groupId: "resting",
		label: "续咖啡",
		description: "休息时抱着咖啡杯喝一口",
		videoBaseSize: 220,
		autoDuration: { minMs: 60_000, maxMs: 120_000 },
	}),
	definePetAction({
		id: "penguin_ship_deploy",
		groupId: "feedback",
		label: "发布上线",
		description: "把小火箭发出去，表示这次发布出去了",
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
