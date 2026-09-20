// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExternalSessionImportSettingsSection } from "./ExternalSessionImportSettingsSection";
import type { ExternalSessionImportSettingsModel } from "./useExternalSessionImportSettingsModel";

function model(overrides: Partial<ExternalSessionImportSettingsModel> = {}): ExternalSessionImportSettingsModel {
	const toggleEnabled: ExternalSessionImportSettingsModel["actions"]["toggleEnabled"] = vi.fn();
	const specifySessionDir: ExternalSessionImportSettingsModel["actions"]["specifySessionDir"] = vi.fn(
		async () => undefined,
	);
	const grok = {
		id: "grok" as const,
		enabled: false,
		canSpecifyPath: false,
		displayPath: "/Users/ada/.grok/sessions",
		labels: {
			name: "Grok",
			pathDescription: "将读取：/Users/ada/.grok/sessions",
		},
	};
	const claude = {
		id: "claude-code" as const,
		enabled: false,
		canSpecifyPath: false,
		displayPath: "/Users/ada/.claude/projects",
		labels: {
			name: "Claude Code",
			pathDescription: "将读取：/Users/ada/.claude/projects",
		},
	};
	return {
		actions: {
			specifySessionDir,
			toggleEnabled,
			specifyGrokSessionDir: () => specifySessionDir("grok"),
			toggleGrokEnabled: (checked) => toggleEnabled("grok", checked),
		},
		tools: [grok, claude],
		canSpecifyGrokPath: false,
		grokDisplayPath: grok.displayPath,
		grokEnabled: false,
		labels: {
			description: "默认关闭。打开后只会读取，不会改写那些文件。",
			grok: "Grok",
			pathDescription: grok.labels.pathDescription,
			specifyPath: "指定目录",
			title: "外部工具会话导入",
		},
		loading: false,
		...overrides,
	};
}

describe("ExternalSessionImportSettingsSection", () => {
	it("以独立分区展示多个工具开关和只读路径，不提供可编辑输入", async () => {
		const current = model();
		render(<ExternalSessionImportSettingsSection model={current} />);

		expect(screen.getByRole("heading", { name: "外部工具会话导入" })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Grok" })).toBeTruthy();
		expect(screen.getByRole("switch", { name: "Claude Code" })).toBeTruthy();
		expect(screen.getByText("将读取：/Users/ada/.grok/sessions")).toBeTruthy();
		expect(screen.queryByRole("textbox")).toBeNull();
		expect(screen.queryByRole("button", { name: "指定目录" })).toBeNull();

		await userEvent.click(screen.getByRole("switch", { name: "Grok" }));
		expect(current.actions.toggleEnabled).toHaveBeenCalledWith("grok", true);
	});

	it("仅在自动探测失败时出现手工指定入口", async () => {
		const specifySessionDir: ExternalSessionImportSettingsModel["actions"]["specifySessionDir"] = vi.fn(
			async () => undefined,
		);
		const current = model({
			actions: {
				specifySessionDir,
				toggleEnabled: vi.fn(),
				specifyGrokSessionDir: () => specifySessionDir("grok"),
				toggleGrokEnabled: vi.fn(),
			},
			tools: [
				{
					id: "grok",
					enabled: false,
					canSpecifyPath: true,
					displayPath: undefined,
					labels: {
						name: "Grok",
						pathDescription: "没有找到 Grok 的默认会话目录。",
					},
				},
			],
			canSpecifyGrokPath: true,
			grokDisplayPath: undefined,
			labels: {
				description: "默认关闭。打开后只会读取，不会改写那些文件。",
				grok: "Grok",
				pathDescription: "没有找到 Grok 的默认会话目录。",
				specifyPath: "指定目录",
				title: "外部工具会话导入",
			},
		});
		render(<ExternalSessionImportSettingsSection model={current} />);

		expect(screen.getByText("没有找到 Grok 的默认会话目录。")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "指定目录" }));
		expect(specifySessionDir).toHaveBeenCalledWith("grok");
	});
});
