// @vitest-environment jsdom
/**
 * 外观设置页的「新会话页装饰」这块区域：装饰件与纹理收在同一块里，
 * 用户点纹理卡片能把选择交回模型，选中态跟着走。
 */
import { THEMES } from "@shared/theme/themes";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { AppearanceSettingsModel } from "./useAppearanceSettingsModel";

const { renderMarioPreview } = vi.hoisted(() => ({ renderMarioPreview: vi.fn() }));

vi.mock("@shared/components/mario/PixelMarioBlocks", () => ({
	PixelMarioBlocks: () => {
		renderMarioPreview();
		return <div data-testid="mario-preview" />;
	},
}));

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key, i18n: { exists: () => true } }),
}));

const { AppearanceSettingsView } = await import("./AppearanceSettingsView.js");

function model(
	overrides: Partial<Omit<AppearanceSettingsModel, "actions">> & {
		actions?: Partial<AppearanceSettingsModel["actions"]>;
	} = {},
): AppearanceSettingsModel {
	return {
		actions: Object.assign(
			{
				changeLanguage: vi.fn(),
				changeMode: vi.fn(),
				changeThemeName: vi.fn(),
				selectUiTheme: vi.fn(),
				setCursorStyle: vi.fn(),
				setOrnament: vi.fn(),
				setSidebarStyle: vi.fn(),
				setTexture: vi.fn(),
			},
			overrides.actions,
		),
		activeUiThemeId: "default",
		cursorOptions: [],
		cursorStyle: "default",
		labels: {
			languageHint: "languageHint",
			newSessionDecorHint: "newSessionDecorHint",
			newSessionDecorTitle: "新会话页装饰",
			ornamentHint: "ornamentHint",
			sections: {
				cursor: "鼠标指针",
				language: "语言",
				mode: "外观模式",
				ornament: "装饰件",
				sidebar: "侧边栏样式",
				texture: "纹理",
				theme: "主题颜色",
				uiTheme: "界面主题",
			},
			textureHint: "textureHint",
			title: "外观",
		},
		language: "system",
		languages: [],
		mode: "dark",
		modeOptions: [],
		narrow: true,
		ornamentId: "none",
		ornamentOptions: [{ active: true, hint: "ornamentNoneHint", id: "none", label: "无" }],
		showUiTheme: false,
		sidebarStyle: "classic",
		sidebarStyleOptions: [],
		textureId: "grid",
		textureOptions: [
			{ active: false, hint: "textureNoneHint", id: "none", label: "无" },
			{ active: true, hint: "textureGridHint", id: "grid", label: "网格" },
		],
		themeName: "default",
		themes: [],
		uiThemes: [],
		...overrides,
	};
}

describe("AppearanceSettingsView 的新会话页装饰区域", () => {
	it("装饰件与纹理紧跟在「新会话页装饰」这条标题之下，不与其它分区混排", () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		// 断言的是分组关系本身（谁归在这条标题之下），不锁具体的盒子：
		// 这块区域是套卡片还是平铺属于视觉选择，改版不该把测试一起打红。
		const headings = Array.from(view.container.querySelectorAll("h2")).map((h) => h.textContent?.trim());
		const groupIndex = headings.indexOf("新会话页装饰");

		expect(groupIndex).toBeGreaterThanOrEqual(0);
		expect(headings.slice(groupIndex + 1, groupIndex + 3)).toEqual(["装饰件", "纹理"]);
		expect(view.getByText("newSessionDecorHint")).toBeTruthy();
	});

	it("点「无」把纹理选择交回模型", async () => {
		const setTexture = vi.fn();
		const view = render(<AppearanceSettingsView model={model({ actions: { setTexture } })} />);

		// 装饰件那组里也有一张「无」，按 hint 取这张才不会点错组。
		await userEvent.click(view.getByTitle("textureNoneHint"));

		expect(setTexture).toHaveBeenCalledWith("none");
	});

	it("当前铺着的那档带选中态，另一档没有", () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		const grid = view.getByTitle("textureGridHint");
		const none = view.getByTitle("textureNoneHint");

		expect(grid.getAttribute("aria-pressed")).toBe("true");
		expect(none.getAttribute("aria-pressed")).toBe("false");
	});

	it("切换外观模式时不会重新渲染无关的装饰预览", () => {
		const initial = model({
			ornamentId: "mario",
			ornamentOptions: [{ active: true, hint: "marioHint", id: "mario", label: "马里奥" }],
		});
		renderMarioPreview.mockClear();
		const view = render(<AppearanceSettingsView model={initial} />);
		expect(renderMarioPreview).toHaveBeenCalledTimes(1);

		view.rerender(<AppearanceSettingsView model={{ ...initial, mode: "light" }} />);

		expect(renderMarioPreview).toHaveBeenCalledTimes(1);
	});
});

describe("外观设置的键盘和选中语义", () => {
	it("七类外观选择均向辅助技术暴露当前值，语言选择器带字段名称", () => {
		const theme = THEMES[0]!;
		const view = render(
			<AppearanceSettingsView
				model={model({
					showUiTheme: true,
					languages: [{ value: "system", native: "跟随系统", alt: "System" }],
					modeOptions: [{ value: "dark", label: "深色", hint: "夜间外观", icon: "" }],
					uiThemes: [
						{
							id: "default",
							label: "默认界面",
							hint: "经典布局",
							active: true,
							disabled: false,
							unavailable: false,
							preview: "/test-theme.webp",
						},
					],
					themes: [theme],
					themeName: theme.id,
					sidebarStyleOptions: [{ id: "classic", label: "经典侧栏", hint: "贴边", active: true }],
					cursorOptions: [{ id: "default", label: "默认指针", hint: "系统指针", active: true }],
				})}
			/>,
		);

		for (const name of [
			"深色 夜间外观",
			"默认界面 经典布局",
			theme.label,
			"经典侧栏 贴边",
			"默认指针 系统指针",
			"网格",
		]) {
			expect(view.getByRole("button", { name, pressed: true })).toBeTruthy();
		}
		expect(view.getByTitle("ornamentNoneHint").getAttribute("aria-pressed")).toBe("true");
		expect(view.getByRole("button", { name: "语言" })).toBeTruthy();
	});

	it("键盘选纹理后当前值立即更新，再用空格切回网格", async () => {
		function Harness(): JSX.Element {
			const [textureId, setTexture] = useState<"none" | "grid">("grid");
			return (
				<AppearanceSettingsView
					model={model({
						textureId,
						textureOptions: [
							{ id: "none", label: "无纹理", hint: "不使用纹理", active: textureId === "none" },
							{ id: "grid", label: "网格", hint: "网格纹理", active: textureId === "grid" },
						],
						actions: {
							setTexture: (id) => {
								if (id === "none" || id === "grid") setTexture(id);
							},
						},
					})}
				/>
			);
		}
		const user = userEvent.setup();
		const view = render(<Harness />);
		view.getByRole("button", { name: "无纹理", pressed: false }).focus();
		await user.keyboard("{Enter}");
		expect(view.getByRole("button", { name: "无纹理", pressed: true })).toBeTruthy();
		view.getByRole("button", { name: "网格", pressed: false }).focus();
		await user.keyboard(" ");
		expect(view.getByRole("button", { name: "网格", pressed: true })).toBeTruthy();
	});
});
