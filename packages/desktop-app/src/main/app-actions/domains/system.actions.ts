import type { ActionDefinition } from "../types.js";

export function registerSystemActions(register: (action: ActionDefinition) => void): void {
	register({
		id: "system.ping",
		domain: "system",
		title: "检查 action runtime",
		summary: "返回 pong，用于验证本地 action 通道是否可用。",
		availability: "gui-main",
		permission: "system.read",
		inputSchema: {
			description: "不需要参数。传入空对象即可。",
		},
		examples: [
			{
				description: "检查 GUI action server 是否可用",
				input: {},
			},
		],
		validateInput: (input) => {
			if (input === undefined || input === null) return {};
			if (typeof input === "object" && !Array.isArray(input)) return {};
			return {};
		},
		run: () => ({
			message: "pong",
		}),
	});
}
