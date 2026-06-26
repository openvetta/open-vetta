export const PET_ACTIONS = [
	{
		id: "sleep",
		fileName: "sleep-cushion.webm",
		label: "睡觉",
		description: "长时间空闲、深夜或低打扰状态",
		videoBaseSize: 220,
	},
	{
		id: "workout",
		fileName: "dumbbell.webm",
		label: "举杠铃",
		description: "短休、任务完成后的积极反馈",
		videoBaseSize: 230,
	},
	{
		id: "typing",
		fileName: "typing.webm",
		label: "敲键盘",
		description: "工作时段、用户正在编码或应用处于活跃状态",
		videoBaseSize: 220,
	},
	{
		id: "music",
		fileName: "music.webm",
		label: "听音乐",
		description: "晚间、放松或非专注状态",
		videoBaseSize: 210,
	},
	{
		id: "hula",
		fileName: "hula-hoop.webm",
		label: "转呼啦圈",
		description: "普通待机中的活泼动作",
		videoBaseSize: 240,
	},
	{
		id: "jump-rope",
		fileName: "jump-rope.webm",
		label: "跳绳",
		description: "久坐提醒、短暂活动提示",
		videoBaseSize: 250,
	},
	{
		id: "tea",
		fileName: "tea.webm",
		label: "喝茶",
		description: "休息、等待模型响应或低强度待机",
		videoBaseSize: 220,
	},
	{
		id: "stoat_wave_backflip_smoke_fade_exit",
		fileName: "stoat_wave_backflip_smoke_fade_exit.webm",
		label: "挥手翻身",
		description: "普通待机中的短动作反馈",
		videoBaseSize: 220,
	},
] as const;

export type PetActionId = (typeof PET_ACTIONS)[number]["id"];
