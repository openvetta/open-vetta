// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPEN_MODEL_SELECTOR_EVENT } from "@/shared/shortcuts";
import { ModelSelector } from "./ModelSelector";
import { ModelSelectorFooterProvider, type ModelSelectorFooterValue } from "./model-selector-footer";

const catalog = vi.hoisted(() => ({ revalidate: vi.fn(async () => undefined) }));
const selected = { key: "p/a", provider: "p", modelId: "a", displayName: "Alpha" };

vi.mock("@shared/store/model-catalog", () => ({ modelCatalog: catalog }));
vi.mock("../hooks/useModelSelectorModel", () => ({
	useModelSelectorModel: () => ({
		empty: false,
		viewProps: {
			selectedModel: selected.key,
			selectedOption: selected,
			menuLevels: [],
			groups: [{ provider: "p", label: "Provider", models: [selected] }],
			labels: {
				placeholder: "Select model",
				searchPlaceholder: "Search models",
				clearSearch: "Clear",
				noResults: "None",
				noResultsHint: "Hint",
				reasoningHeader: "Reasoning",
				modelHeader: "Models",
				cloudOnly: "Cloud",
				visionBadge: "Vision",
				defaultBadge: "Default",
				levelLabel: (value: string) => value,
			},
			onModelSelect: vi.fn(),
			onReasoningSelect: vi.fn(),
			onOpenChange: (open: boolean) => {
				if (open) void catalog.revalidate();
			},
		},
	}),
}));
vi.mock("@shared/hooks/useShortcutBinding", () => ({ useShortcutBinding: () => "mod+p" }));
vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const executionMode: NonNullable<ModelSelectorFooterValue["executionMode"]> = {
	open: false,
	disabled: false,
	selectedOption: {
		mode: "sandbox",
		icon: "icon-[solar--shield-linear]",
		label: "Sandbox",
		title: "Sandbox mode",
		disabled: false,
		selected: true,
	},
	options: [],
	onOpenChange: vi.fn(),
	onSelect: vi.fn(),
};

function renderWithFooter(value: ModelSelectorFooterValue | null) {
	return render(
		<ModelSelectorFooterProvider value={value}>
			<ModelSelector />
		</ModelSelectorFooterProvider>,
	);
}

const fireShortcut = () => act(() => void window.dispatchEvent(new Event(OPEN_MODEL_SELECTOR_EVENT)));

beforeEach(() => {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			observe(): void {}
			unobserve(): void {}
			disconnect(): void {}
		},
	);
	HTMLElement.prototype.scrollIntoView = vi.fn();
	catalog.revalidate.mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("ModelSelector 底栏与快捷键", () => {
	it("快捷键事件切换菜单开合，并像手动打开一样刷新模型目录", async () => {
		renderWithFooter({ active: true });
		expect(screen.queryByPlaceholderText("Search models")).toBeNull();

		fireShortcut();
		expect(await screen.findByPlaceholderText("Search models")).toBeTruthy();
		expect(catalog.revalidate).toHaveBeenCalledTimes(1);

		fireShortcut();
		await waitFor(() => expect(screen.queryByPlaceholderText("Search models")).toBeNull());
	});

	it("底栏左侧显示当前快捷键，右侧是沙箱权限选择并带着文字", async () => {
		renderWithFooter({ active: true, executionMode });
		fireShortcut();
		await screen.findByPlaceholderText("Search models");

		expect(screen.getByText("P")).toBeTruthy();
		expect(screen.getByRole("button", { name: /Sandbox/ }).textContent).toContain("Sandbox");
	});

	it("输入栏不可见（active=false）时不响应快捷键", async () => {
		renderWithFooter({ active: false, executionMode });
		fireShortcut();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByPlaceholderText("Search models")).toBeNull();
	});

	it("没有底栏上下文的模型选择器不响应快捷键、也没有底栏", async () => {
		renderWithFooter(null);
		fireShortcut();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.queryByPlaceholderText("Search models")).toBeNull();
	});
});
