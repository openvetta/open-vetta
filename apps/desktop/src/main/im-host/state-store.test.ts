import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	applyDeliveryChat,
	applyStatePatch,
	clearDeliveryChat,
	type ImStateFile,
	loadImState,
	saveImState,
} from "./state-store.js";

const empty: ImStateFile = { version: 3, sessions: [] };
const at = new Date("2026-11-25T09:00:00.000Z");

describe("自动化结果的接收对话", () => {
	it("第一个私聊成为接收对话，之后别的私聊不会改掉它", () => {
		const first = applyDeliveryChat(empty, "telegram", { chatId: "dm-owner", userId: "owner", explicit: false }, at);
		const later = applyDeliveryChat(first, "telegram", {
			chatId: "dm-stranger",
			userId: "stranger",
			explicit: false,
		});

		expect(later).toBe(first);
		expect(later.deliveryChats?.telegram).toEqual({
			chatId: "dm-owner",
			userId: "owner",
			explicit: false,
			setAt: at.toISOString(),
		});
	});

	it("/notify 总会改到发命令的对话", () => {
		const auto = applyDeliveryChat(empty, "telegram", { chatId: "dm-owner", userId: "owner", explicit: false });
		const chosen = applyDeliveryChat(auto, "telegram", { chatId: "group-1", userId: "owner", explicit: true });

		expect(chosen.deliveryChats?.telegram).toMatchObject({ chatId: "group-1", explicit: true });
	});

	it("各渠道分开记，清除只影响一个渠道", () => {
		let state = applyDeliveryChat(empty, "telegram", { chatId: "tg", userId: "u", explicit: false });
		state = applyDeliveryChat(state, "feishu", { chatId: "fs", userId: "u", explicit: false });
		state = clearDeliveryChat(state, "telegram");

		expect(state.deliveryChats).toEqual({ feishu: expect.objectContaining({ chatId: "fs" }) });
	});

	it("会话路由的变更不会丢掉接收对话，并且能存盘读回", () => {
		let state = applyDeliveryChat(empty, "slack", { chatId: "D1", userId: "U1", explicit: true }, at);
		state = applyStatePatch(state, { userId: "U1", chatId: "D1", sessionPath: "/s.jsonl", updatedAt: "" });
		const file = join(mkdtempSync(join(tmpdir(), "im-state-")), "im-state.json");
		saveImState(state, file);

		expect(loadImState(file)).toEqual(state);
	});

	it("读旧文件或坏数据时不带接收对话", () => {
		const file = join(mkdtempSync(join(tmpdir(), "im-state-")), "im-state.json");
		writeFileSync(
			file,
			JSON.stringify({
				version: 3,
				sessions: [],
				deliveryChats: { telegram: { chatId: "" }, unknown: { chatId: "x" }, slack: "D1" },
			}),
		);

		expect(loadImState(file).deliveryChats).toBeUndefined();
	});
});
