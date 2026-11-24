// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PetSettingsView, type PetSettingsViewProps } from "./PetSettingsView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
	for (const { root, container } of mounted.splice(0)) {
		act(() => root.unmount());
		container.remove();
	}
});

const section = (id: string) => ({ id });

function renderView(overrides: Partial<PetSettingsViewProps> = {}) {
	// Sizes the view committed, in order.
	const committedSizes: number[] = [];
	const onCommit = vi.fn((value: number) => {
		committedSizes.push(value);
	});
	const onChangeAutoMode = vi.fn();
	const props: PetSettingsViewProps = {
		labels: {
			pageTitle: "Vetta Vivi",
			materialMissing: "",
			decorationAvailable: "",
			decorationMissing: "",
			showPet: "显示桌宠",
			showPetDescription: "",
			alwaysOnTop: "保持在最前",
			alwaysOnTopDescription: "",
			decorationSectionDescription: "",
			developerDescription: "",
			debugFrame: "调试边框",
			debugFrameDescription: "",
			size: "大小",
			sizeDescription: "",
			autoMode: "自动切换动作",
			autoModeDescription: "",
			actionsSectionDescription: "",
			sections: {
				display: "显示与窗口",
				behavior: "行为",
				actions: "动作",
				decoration: "装饰",
				developer: "开发调试",
			},
		},
		sections: {
			display: section("pet-display"),
			behavior: section("pet-behavior"),
			actions: section("pet-actions"),
			decoration: section("pet-decoration"),
			developer: section("pet-developer"),
		},
		enabled: true,
		autoMode: true,
		alwaysOnTop: true,
		debugFrame: false,
		size: { value: 1, min: 0.4, max: 2.5, step: 0.05, onCommit },
		actionGallery: <div>动作画廊</div>,
		decorations: [],
		showDecorationSection: false,
		aiAssistSlot: null,
		onChangeEnabled: vi.fn(),
		onChangeAlwaysOnTop: vi.fn(),
		onChangeAutoMode,
		onChangeDebugFrame: vi.fn(),
		...overrides,
	};
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push({ root, container });
	act(() => root.render(<PetSettingsView {...props} />));
	return { container, committedSizes, onChangeAutoMode };
}

describe("Vetta Vivi 设置页", () => {
	it("展示显示、行为、动作与开发调试分区", () => {
		const { container } = renderView();

		for (const title of ["显示与窗口", "行为", "动作", "开发调试"]) {
			expect(container.textContent).toContain(title);
		}
		expect(container.textContent).toContain("动作画廊");
		expect(container.textContent).toContain("100%");
		expect(container.textContent).not.toContain("气泡样式");
		expect(container.textContent).not.toContain("互动方式");
	});

	it("键盘调整大小时提交新的缩放值", () => {
		const { container, committedSizes } = renderView();
		const slider = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="大小"]');

		act(() => {
			slider?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		});

		expect(committedSizes).toHaveLength(1);
		expect(committedSizes[0]).toBeCloseTo(1.05);
	});

	it("桌宠隐藏时大小与自动切换不可调", () => {
		const { container } = renderView({ enabled: false });

		expect(container.querySelector<HTMLInputElement>('input[aria-label="大小"]')?.disabled).toBe(true);
		const autoModeSwitch = container.querySelector<HTMLButtonElement>('[data-setting-section-id="pet-behavior"] button');
		expect(autoModeSwitch?.disabled).toBe(true);
	});
});
