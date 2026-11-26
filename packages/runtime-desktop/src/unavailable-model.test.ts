import { AI_ERROR_CODES, type Api, type Context, type Model } from "@vetta/ai";
import { describe, expect, it, vi } from "vitest";
import {
	createUnavailableModel,
	DEFAULT_UNAVAILABLE_MODEL_MESSAGE,
	guardUnavailableModelStream,
	isUnavailableModel,
} from "./unavailable-model.js";

const REAL_MODEL: Model<Api> = { ...createUnavailableModel(), provider: "deepseek", id: "deepseek-chat" };
const CONTEXT: Context = { messages: [] };

describe("没有可用模型时的占位模型", () => {
	it("只认出占位模型,真实模型和缺省都不算", () => {
		expect(isUnavailableModel(createUnavailableModel())).toBe(true);
		expect(isUnavailableModel(REAL_MODEL)).toBe(false);
		expect(isUnavailableModel(undefined)).toBe(false);
	});

	it("占位模型的请求在发出前就失败,报宿主给的文案", () => {
		const inner = vi.fn();
		const guarded = guardUnavailableModelStream(inner, () => "请先配置模型");

		expect(() => guarded(createUnavailableModel(), CONTEXT)).toThrow(
			expect.objectContaining({ code: AI_ERROR_CODES.MODEL_NOT_FOUND, message: "请先配置模型" }),
		);
		expect(inner).not.toHaveBeenCalled();
	});

	it("宿主没给文案时用默认英文提示", () => {
		expect(() => guardUnavailableModelStream(vi.fn())(createUnavailableModel(), CONTEXT)).toThrow(
			DEFAULT_UNAVAILABLE_MODEL_MESSAGE,
		);
	});

	it("真实模型原样交给原来的流函数", () => {
		const stream = { kind: "stream" };
		const inner = vi.fn(() => stream);
		const guarded = guardUnavailableModelStream(inner as never);

		expect(guarded(REAL_MODEL, CONTEXT, { apiKey: "k" })).toBe(stream);
		expect(inner).toHaveBeenCalledWith(REAL_MODEL, CONTEXT, { apiKey: "k" });
	});
});
