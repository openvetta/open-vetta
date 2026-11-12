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
				setOrnament: vi.fn(),
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
		labels: {
			newSessionDecorHint: "newSessionDecorHint",
			newSessionDecorTitle: "新会话页装饰",
			ornamentHint: "ornamentHint",
			sections: {
				appIcon: "应用图标",
				language: "语言",
				mode: "外观模式",
				ornament: "装饰件",
				texture: "纹理",
				theme: "主题颜色",
				uiTheme: "界面主题",
				uiZoom: "界面大小",
			},
			textureHint: "textureHint",
			title: "外观",
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
	it("装饰件与纹理是「新会话页装饰」这一组里的两个设置项，选项收在 popover 里", () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		const headings = Array.from(view.container.querySelectorAll("h2")).map((h) => h.textContent?.trim());
		expect(headings).toContain("新会话页装饰");
		expect(view.getByText("newSessionDecorHint")).toBeTruthy();
		// 触发器只显示当前选中的那一档，别的档在 popover 打开前不渲染。
		expect(view.getByRole("button", { name: "纹理" }).textContent).toContain("网格");
		expect(view.queryByTitle("textureNoneHint")).toBeNull();
	});

	it("点开纹理 popover 选「无」，把纹理选择交回模型", async () => {
		const setTexture = vi.fn();
		const view = render(<AppearanceSettingsView model={model({ actions: { setTexture } })} />);

		await userEvent.click(view.getByRole("button", { name: "纹理" }));
		await userEvent.click(await view.findByTitle("textureNoneHint"));

		expect(setTexture).toHaveBeenCalledWith("none");
	});

	it("popover 里当前铺着的那档带选中态，另一档没有", async () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		await userEvent.click(view.getByRole("button", { name: "纹理" }));
		const grid = await view.findByTitle("textureGridHint");
		const none = await view.findByTitle("textureNoneHint");

		expect(grid.querySelector('[class*="mdi--check"]')).not.toBeNull();
		expect(none.querySelector('[class*="mdi--check"]')).toBeNull();
	});

	it("切换外观模式时不会重新渲染无关的装饰预览", async () => {
		const initial = model({
			ornamentId: "mario",
			ornamentOptions: [{ active: true, hint: "marioHint", id: "mario", label: "马里奥" }],
		});
		renderMarioPreview.mockClear();
		const view = render(<AppearanceSettingsView model={initial} />);
		await userEvent.click(view.getByRole("button", { name: "装饰件" }));
		await view.findByTitle("marioHint");
		const rendered = renderMarioPreview.mock.calls.length;

		view.rerender(<AppearanceSettingsView model={{ ...initial, mode: "light" }} />);

		expect(renderMarioPreview).toHaveBeenCalledTimes(rendered);
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

	it("界面大小行只显示当前百分比，点开 popover 后恢复默认在默认值时不可点", async () => {
		const view = render(<AppearanceSettingsView model={model()} />);

		expect(view.queryByRole("button", { name: "恢复默认" })).toBeNull();
		await userEvent.click(view.getByText("100%"));

		expect(((await view.findByRole("button", { name: "恢复默认" })) as HTMLButtonElement).disabled).toBe(true);
	});

	it("偏离默认值时可在 popover 里恢复默认", async () => {
		const resetUiZoom = vi.fn();
		const view = render(
			<AppearanceSettingsView
				model={model({
					uiZoom: { default: 1, factor: 1.25, stepIndex: 4, steps: [0.75, 0.9, 1, 1.1, 1.25, 1.5] },
					actions: { resetUiZoom },
				})}
			/>,
		);

		await userEvent.click(view.getByText("125%"));
		await userEvent.click(await view.findByRole("button", { name: "恢复默认" }));

		expect(resetUiZoom).toHaveBeenCalledTimes(1);
	});

	it("在 popover 里点某一档的文字，按该档的比例设置界面大小", async () => {
		const setUiZoom = vi.fn();
		const view = render(<AppearanceSettingsView model={model({ actions: { setUiZoom } })} />);

		await userEvent.click(view.getByText("100%"));
		await userEvent.click(await view.findByRole("button", { name: "125%" }));

		expect(setUiZoom).toHaveBeenCalledWith(1.25);
	});
});
