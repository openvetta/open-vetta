function definePetAction<const TId extends string>(action: {
	id: TId;
	label: string;
	description: string;
	videoBaseSize: number;
}): {
	id: TId;
	fileName: `${TId}.webm`;
	label: string;
	description: string;
	videoBaseSize: number;
} {
	return {
		...action,
		fileName: `${action.id}.webm`,
	};
}

export const PET_ACTIONS = [
	definePetAction({
		id: "stoat_sleep_lie_on_cushion",
		label: "睡觉",
		description: "长时间空闲、深夜或低打扰状态",
		videoBaseSize: 220,
	}),
	definePetAction({
		id: "stoat_stand_lift_barbell_one_hand_fast",
		label: "举杠铃",
		description: "短休、任务完成后的积极反馈",
		videoBaseSize: 230,
	}),
	definePetAction({
		id: "stoat_work_laptop_typing_desk_cushion",
		label: "敲键盘",
		description: "工作时段、用户正在编码或应用处于活跃状态",
		videoBaseSize: 220,
	}),
	definePetAction({
		id: "stoat_listen_music_headphones_nod",
		label: "听音乐",
		description: "晚间、放松或非专注状态",
		videoBaseSize: 210,
	}),
	definePetAction({
		id: "stoat_spin_color_hula_hoop",
		label: "转呼啦圈",
		description: "普通待机中的活泼动作",
		videoBaseSize: 240,
	}),
	definePetAction({
		id: "stoat_skip_rope_jump",
		label: "跳绳",
		description: "久坐提醒、短暂活动提示",
		videoBaseSize: 250,
	}),
	definePetAction({
		id: "stoat_sit_cushion_drink_tea_slow",
		label: "喝茶",
		description: "休息、等待模型响应或低强度待机",
		videoBaseSize: 220,
	}),
	definePetAction({
		id: "stoat_wave_backflip_smoke_fade_exit",
		label: "再见",
		description: "普通待机中的短动作反馈",
		videoBaseSize: 220,
	}),
] as const;

export type PetActionId = (typeof PET_ACTIONS)[number]["id"];
