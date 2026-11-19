// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GitSettingsView } from "../src/components/GitSettingsView";
import { setGitCommand, setStorageApi } from "../src/git/runtime";

vi.mock("@vetta-org/plugin-sdk", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vetta-org/plugin-sdk")>();
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key, locale: "en" }),
		useActivityTab: () => ({ cwd: "/repo" }),
		// 宿主的模型选择器由宿主经 bridge 注入；插件测试里用窄 fake 代替，
		// 保留受控 value 与空值项，好断言设置页确实渲染的是宿主组件。
		ModelPicker: ({ value, emptyOption }: { value: string | null; emptyOption?: { label: string } }) => (
			<button type="button" data-testid="host-model-picker">
				{value ?? emptyOption?.label ?? ""}
			</button>
		),
	};
});

afterEach(() => {
	cleanup();
});

function host(): void {
	setGitCommand({
		run: vi.fn(async (_file: string, args: string[] = []) =>
			args[0] === "--version"
				? { exitCode: 0, stdout: "git version 2.43.0\n", stderr: "" }
				: { exitCode: 0, stdout: "true\n", stderr: "" },
		),
	});
	// 已保存过「提交后自动推送」，用来确认读回来的值真的喂给了宿主控件。
	storageWith({ messageTemplate: "", modelKey: "openai/gpt-5", pushAfterCommit: true, confirmDiscard: true });
}

/** 插件的设置读写走 storage.readFile/writeFile，内容是一份 JSON。 */
function storageWith(value: Record<string, unknown> | null): void {
	setStorageApi({
		readFile: async () => (value === null ? null : JSON.stringify(value)),
		writeFile: async () => ({ revision: "1", changedPaths: [] }),
	} as never);
}

describe("Git settings page chrome", () => {
	it("composes the page from the host's setting sections instead of drawing its own cards", async () => {
		host();
		render(<GitSettingsView />);

		await screen.findByText("settings.commitSectionTitle");
		expect(screen.getByText("settings.behaviorSectionTitle")).toBeTruthy();

		// SettingSection 由宿主提供：标题与卡片容器上带着它自己的锚点标记，自绘的 div 不会有。
		expect(document.querySelector('[data-setting-section-id="git-commit-message"]')).not.toBeNull();
		expect(document.querySelector('[data-setting-section-id="git-panel-behavior"]')).not.toBeNull();
	});

	it("uses the host model picker and shows the saved model key", async () => {
		host();
		render(<GitSettingsView />);

		const picker = await screen.findByTestId("host-model-picker");
		expect(picker.textContent).toBe("openai/gpt-5");
	});

	it("falls back to the follow-default label when no model is pinned", async () => {
		host();
		storageWith({ messageTemplate: "", modelKey: null, pushAfterCommit: false, confirmDiscard: true });
		render(<GitSettingsView />);

		const picker = await screen.findByTestId("host-model-picker");
		expect(picker.textContent).toBe("settings.modelDefault");
	});
});
