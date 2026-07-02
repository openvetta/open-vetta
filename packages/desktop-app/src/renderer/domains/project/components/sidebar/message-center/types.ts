export type MessageCenterTab = "all" | "notifications" | "flowing" | "chat";

export type MessageCenterTabConfig = {
	value: MessageCenterTab;
	icon: string;
};

export const MESSAGE_CENTER_TABS: MessageCenterTabConfig[] = [
	{ value: "all", icon: "icon-[solar--inbox-linear]" },
	{ value: "chat", icon: "icon-[solar--chat-round-line-linear]" },
	{ value: "flowing", icon: "icon-[solar--transfer-horizontal-linear]" },
	{ value: "notifications", icon: "icon-[solar--bell-linear]" },
];

export const MESSAGE_CENTER_SPRING = { type: "spring" as const, stiffness: 420, damping: 32 };
