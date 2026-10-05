// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentSettings } from "./AgentSettings";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => true } }) }));

afterEach(() => {
	Reflect.deleteProperty(window, "vetta");
});

describe("Agent 设置可访问操作", () => {
	it("按字段名称编辑个性化并保存，逐项切换扩展能力保持独立配置", async () => {
		const configSet = vi.fn(async () => {});
		const setPersonalization = vi.fn(async () => {});
		Object.defineProperty(window, "vetta", {
			configurable: true,
			value: {
				config: {
					get: async () => ({ experimental: { vettaCli: false, promptPrediction: false, agentSkills: true } }),
					set: configSet,
				},
				session: {
					getPersonas: async () => [],
					getPersonalization: async () => ({ personaId: "default", customPrompt: "" }),
					setPersonalization,
				},
				media: { listProviders: async () => [] },
				runtimeConfiguration: {
					list: async () => ({ entries: [], definitionVersion: 1, snapshotId: "test" }),
					onChanged: () => () => {},
				},
				plugins: { onMediaProvidersChanged: () => () => {}, onOcrProvidersChanged: () => () => {} },
			},
		});
		const user = userEvent.setup();
		render(<AgentSettings />);
		await waitFor(() =>
			expect(screen.getByRole("switch", { name: "agentSettings.appOp", checked: false })).toBeTruthy(),
		);
		await user.type(
			screen.getByRole("textbox", { name: "agentSettings.customInstructions" }),
			"Keep answers concise",
		);
		await user.click(screen.getByRole("button", { name: "agentSettings.apply" }));
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "agentSettings.applied" }).hasAttribute("disabled")).toBe(true),
		);
		expect(setPersonalization).toHaveBeenCalledWith({ personaId: "default", customPrompt: "Keep answers concise" });
		await user.click(screen.getByRole("switch", { name: "agentSettings.appOp" }));
		await user.click(screen.getByRole("switch", { name: "agentSettings.inputPrediction" }));
		await user.click(screen.getByRole("switch", { name: "agentSettings.agentSkill" }));
		expect(configSet.mock.calls).toEqual([
			[{ experimental: { vettaCli: true } }],
			[{ experimental: { promptPrediction: true } }],
			[{ experimental: { agentSkills: false } }],
		]);
	});
});
