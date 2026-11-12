// @vitest-environment jsdom
/**
 * 外观设置页的「新会话页装饰」这块区域：装饰件与纹理收在同一块里，
 * 用户点纹理卡片能把选择交回模型，选中态跟着走。
 */
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
				setAppIcon: vi.fn(),
				selectUiTheme: vi.fn(),
				setCursorStyle: vi.fn(),
				setOrnament: vi.fn(),
				setSidebarStyle: vi.fn(),
				setTexture: vi.fn(),
				setUiZoom: vi.fn(),
				resetUiZoom: vi.fn(),
			},
			overrides.actions,
		),
		activeUiThemeId: "default",
		appIconOptions: [
			{ active: true, id: "default", label: "默认", preview: "default.png" },
			{ active: false, id: "coding", label: "编程", preview: "coding.png" },
		],
		cursorOptions: [],
		cursorStyle: "default",
		labels: {
			languageHint: "languageHint",
			newSessionDecorHint: "newSessionDecorHint",
			newSessionDecorTitle: "新会话页装饰",
			ornamentHint: "ornamentHint",
			sections: {
				appIcon: "应用图标",
				cursor: "鼠标指针",
				language: "语言",
				mode: "外观模式",
				ornament: "装饰件",
				sidebar: "侧边栏样式",
				texture: "纹理",
				theme: "主题颜色",
				uiTheme: "界面主题",
				uiZoom: "界面大小",
			},
			textureHint: "textureHint",
			title: "外观",
			uiZoomHint: "uiZoomHint",
			uiZoomReset: "恢复默认",
			uiZoomSliderLabel: "界面大小滑块",
		},
		language: "system",
		languages: [],
		mode: "dark",
		modeOptions: [],
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
		uiZoom: { default: 1, factor: 1, stepIndex: 2, steps: [0.75, 0.9, 1, 1.1, 1.25, 1.5] },
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

		expect(grid.querySelector('[class*="mdi--check"]')).not.toBeNull();
		expect(none.querySelector('[class*="mdi--check"]')).toBeNull();
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

	it("应用图标区：只显示当前图标，点开 popover 选另一个把 id 交回模型", async () => {
		const setAppIcon = vi.fn();
		const view = render(<AppearanceSettingsView model={model({ actions: { setAppIcon } })} />);

		expect(view.getAllByText("应用图标").length).toBeGreaterThan(0);
		expect(view.queryByTitle("编程")).toBeNull();
		await userEvent.click(view.getByText("默认"));
		await userEvent.click(await view.findByTitle("编程"));

		expect(setAppIcon).toHaveBeenCalledWith("coding");
	});

	it("界面大小显示当前百分比，恢复默认在默认值时不可点", () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		expect((view.getByRole("button", { name: "恢复默认" }) as HTMLButtonElement).disabled).toBe(true);
	});

	it("偏离默认值时可恢复默认", async () => {
		const resetUiZoom = vi.fn();
		const view = render(
			<AppearanceSettingsView
				model={model({
					uiZoom: { default: 1, factor: 1.25, stepIndex: 4, steps: [0.75, 0.9, 1, 1.1, 1.25, 1.5] },
					actions: { resetUiZoom },
				})}
			/>,
		);

		await userEvent.click(view.getByRole("button", { name: "恢复默认" }));

		expect(resetUiZoom).toHaveBeenCalledTimes(1);
	});

	it("点某一档的文字，按该档的比例设置界面大小，当前档带选中态", async () => {
		const setUiZoom = vi.fn();
		const view = render(<AppearanceSettingsView model={model({ actions: { setUiZoom } })} />);

		expect(view.getByRole("button", { name: "100%" }).getAttribute("aria-pressed")).toBe("true");
		await userEvent.click(view.getByRole("button", { name: "125%" }));

		expect(setUiZoom).toHaveBeenCalledWith(1.25);
	});
});
