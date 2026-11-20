// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { ColorSwatchPicker, type ColorSwatchPickerProps } from "./color-swatch-picker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OPTIONS = [
	{ value: "#1d1d1f", label: "黑" },
	{ value: "#0071e3", label: "蓝" },
	{ value: "#34c759", label: "绿" },
];

let mounted: Root | undefined;

afterEach(() => {
	act(() => mounted?.unmount());
	mounted = undefined;
	document.body.replaceChildren();
});

/** 真实用法是受控的：宿主把 onChange 写回 state。测试走同一条路径，断言用户看到的最终状态。 */
function Host({ initial, ...props }: Partial<ColorSwatchPickerProps> & { initial: string | null }) {
	const [value, setValue] = useState<string | null>(initial);
	return (
		<ColorSwatchPicker
			{...props}
			labels={{ title: "颜色", custom: "自定义", ...props.labels }}
			options={props.options ?? OPTIONS}
			value={value}
			onChange={setValue}
		/>
	);
}

async function mount(props: Partial<ColorSwatchPickerProps> & { initial: string | null }) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = root;
	await act(async () => {
		root.render(<Host {...props} />);
	});
	return host;
}

function dots(host: HTMLElement): HTMLButtonElement[] {
	return Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
}

function checks(host: HTMLElement): string[] {
	return dots(host).map((dot) => dot.getAttribute("aria-checked") ?? "");
}

async function openPanel(host: HTMLElement): Promise<HTMLElement | null> {
	await act(async () => dots(host).at(-1)?.click());
	return document.querySelector<HTMLElement>('[data-slot="color-picker"]');
}

async function typeInto(input: HTMLInputElement | null, text: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		if (!input) return;
		setter?.call(input, text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

describe("ColorSwatchPicker", () => {
	test("预设渲染成一组单选项，选中项与下方名字对应", async () => {
		const host = await mount({ initial: "#0071e3" });
		expect(host.querySelector('[role="radiogroup"]')).not.toBeNull();
		expect(checks(host)).toEqual(["false", "true", "false"]);
		expect(host.textContent).toContain("蓝");
		expect(host.textContent).toContain("颜色");
	});

	test("点另一枚色点：选中态与名字都跟着换", async () => {
		const host = await mount({ initial: "#0071e3" });

		await act(async () => dots(host)[2]?.click());

		expect(checks(host)).toEqual(["false", "false", "true"]);
		expect(host.textContent).toContain("绿");
	});

	test("预设写成 rgb() 时也能和选中值对上", async () => {
		const host = await mount({
			initial: "#34c759",
			options: [
				{ value: "rgb(29, 29, 31)", label: "黑" },
				{ value: "#34c759", label: "绿" },
			],
		});
		expect(checks(host)[1]).toBe("true");
	});

	test("未开启自定义时没有额外色点；开启后多一枚自定义位", async () => {
		const plain = await mount({ initial: "#0071e3" });
		expect(dots(plain)).toHaveLength(3);
		document.body.replaceChildren();

		const custom = await mount({ initial: "#0071e3", allowCustom: true });
		const items = dots(custom);
		expect(items).toHaveLength(4);
		expect(items[3]?.getAttribute("aria-label")).toBe("自定义");
	});

	test("点自定义位打开取色面板，输入 rgb() 后该点被染上颜色并选中", async () => {
		const host = await mount({ initial: "#0071e3", allowCustom: true });
		const panel = await openPanel(host);
		expect(panel).not.toBeNull();

		const input = panel?.querySelector<HTMLInputElement>('input[type="text"]') ?? null;
		await typeInto(input, "rgb(142, 197, 255)");
		await act(async () => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});

		expect(checks(host)).toEqual(["false", "false", "false", "true"]);
		expect(host.textContent).toContain("#8ec5ff");
	});

	test("面板里输入无法识别的颜色时不改选中项，并标出 aria-invalid", async () => {
		const host = await mount({ initial: "#0071e3", allowCustom: true });
		const panel = await openPanel(host);

		const input = panel?.querySelector<HTMLInputElement>('input[type="text"]') ?? null;
		await typeInto(input, "不是颜色");
		await act(async () => {
			input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});

		expect(checks(host)).toEqual(["false", "true", "false", "false"]);
		expect(input?.getAttribute("aria-invalid")).toBe("true");
	});

	test("拖色相滑轨：面板与色点都换成新颜色", async () => {
		const host = await mount({ initial: "#ff0000", allowCustom: true });
		const panel = await openPanel(host);
		const hue = panel?.querySelector<HTMLInputElement>('input[type="range"]') ?? null;
		expect(hue).not.toBeNull();

		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		await act(async () => {
			setter?.call(hue, "120");
			hue?.dispatchEvent(new Event("input", { bubbles: true }));
		});

		expect(host.textContent).toContain("#00ff00");
		expect(checks(host)).toEqual(["false", "false", "false", "true"]);
	});

	test("明度选区支持方向键（无鼠标时的可操作路径）", async () => {
		const host = await mount({ initial: "#0071e3", allowCustom: true });
		const panel = await openPanel(host);
		const area = panel?.querySelector<HTMLElement>('[role="group"]') ?? null;

		await act(async () => {
			area?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
		});

		const shown = host.textContent ?? "";
		expect(shown).toContain("#");
		expect(shown).not.toContain("#0071e3");
	});

	test("disabled 时点色点不改变选中态，也不打开面板", async () => {
		const host = await mount({ initial: "#0071e3", allowCustom: true, disabled: true });

		await act(async () => dots(host)[2]?.click());
		await act(async () => dots(host)[3]?.click());

		expect(checks(host)).toEqual(["false", "true", "false", "false"]);
		expect(host.textContent).toContain("蓝");
		expect(document.querySelector('[data-slot="color-picker"]')).toBeNull();
	});

	test("给了 defaultOption 时多一枚「默认」位：值空时它被选中，点它会回传空", async () => {
		const host = await mount({ initial: null, defaultOption: { label: "跟随主题" } });
		const items = dots(host);
		expect(items).toHaveLength(4);
		expect(items[0]?.getAttribute("aria-label")).toBe("跟随主题");
		expect(checks(host)).toEqual(["true", "false", "false", "false"]);
		expect(host.textContent).toContain("跟随主题");

		document.body.replaceChildren();
		const picked = await mount({ initial: "#34c759", defaultOption: { label: "跟随主题" } });
		expect(checks(picked)[0]).toBe("false");

		await act(async () => dots(picked)[0]?.click());
		expect(checks(picked)).toEqual(["true", "false", "false", "false"]);
		expect(picked.textContent).toContain("跟随主题");
	});

	test("showLabel=false 时不在色点下方重复颜色名", async () => {
		const host = await mount({ initial: "#0071e3", showLabel: false });
		expect(host.textContent).toContain("颜色");
		expect(host.textContent).not.toContain("蓝");
	});

	test("没选任何颜色时名字位留空占位，而不是某枚色点的名字", async () => {
		const host = await mount({ initial: null });
		expect(checks(host).every((value) => value === "false")).toBe(true);
		expect(host.textContent).toContain("—");
	});
});
