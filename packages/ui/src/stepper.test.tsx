// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Stepper, type StepperProps } from "./stepper";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Root | undefined;

afterEach(() => {
	act(() => mounted?.unmount());
	mounted = undefined;
	document.body.replaceChildren();
	vi.useRealTimers();
});

/**
 * 真实用法是受控的：宿主把 onValueChange 写回 state。测试也走这条路径，
 * 否则「按住连加」这类依赖回写的用例在固定 value 下会一直停在同一格。
 */
function Harness({ initial, ...props }: Partial<StepperProps> & { initial: number }) {
	const [value, setValue] = useState(initial);
	return <Stepper {...props} value={value} onValueChange={setValue} />;
}

async function mount(props: Partial<StepperProps> & { initial: number }) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	mounted = root;
	await act(async () => {
		root.render(<Harness {...props} />);
	});
	const input = host.querySelector("input") as HTMLInputElement;
	const [minus, plus] = Array.from(host.querySelectorAll("button")) as HTMLButtonElement[];
	return { host, input, minus: minus as HTMLButtonElement, plus: plus as HTMLButtonElement };
}

async function click(node: HTMLElement) {
	await act(async () => {
		node.click();
	});
}

async function focus(input: HTMLInputElement) {
	await act(async () => {
		input.focus();
	});
}

async function type(input: HTMLInputElement, text: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	await act(async () => {
		setter?.call(input, text);
		input.dispatchEvent(new Event("input", { bubbles: true }));
	});
}

async function press(input: HTMLInputElement, key: string) {
	await act(async () => {
		input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
	});
}

describe("Stepper", () => {
	test("加减号各走一个 step，并把新值回写宿主", async () => {
		const { input, minus, plus } = await mount({ initial: 3 });

		await click(plus);
		expect(input.value).toBe("4");

		await click(minus);
		expect(input.value).toBe("3");
	});

	test("落到 step 网格上：min=0、step=5 时只可能出现 0/5/10", async () => {
		const { input, plus, minus } = await mount({ initial: 0, min: 0, step: 5 });

		await click(plus);
		expect(input.value).toBe("5");
		await click(plus);
		expect(input.value).toBe("10");
		await click(minus);
		expect(input.value).toBe("5");
	});

	test("小数步长不带浮点尾巴", async () => {
		const { input, plus } = await mount({ initial: 0, step: 0.1 });

		await click(plus);
		await click(plus);
		await click(plus);
		expect(input.value).toBe("0.3");
	});

	test("到 min / max 时对应按钮禁用，不会越界", async () => {
		const { input, plus, minus } = await mount({ initial: 9, min: 8, max: 10 });

		expect(minus.disabled).toBe(false);
		expect(plus.disabled).toBe(false);

		await click(plus);
		expect(input.value).toBe("10");
		expect(plus.disabled).toBe(true);
		expect(minus.disabled).toBe(false);

		await click(minus);
		await click(minus);
		expect(input.value).toBe("8");
		expect(minus.disabled).toBe(true);
	});

	test("输入框可直接编辑：回车提交并按 bounds / step 归一", async () => {
		const { input } = await mount({ initial: 5, min: 0, max: 10, step: 2 });

		await focus(input);
		await type(input, "7");
		await press(input, "Enter");

		// 7 不在 step=2 的网格上，提交后落到最近的 8。
		expect(input.value).toBe("8");

		await focus(input);
		await type(input, "99");
		await press(input, "Enter");
		expect(input.value).toBe("10");
	});

	test("非法输入不吞成 0：失焦后恢复原值", async () => {
		const { input } = await mount({ initial: 5 });

		await focus(input);
		await type(input, "abc");
		await act(async () => {
			input.blur();
		});

		expect(input.value).toBe("5");
	});

	test("Esc 撤销正在编辑的草稿", async () => {
		const { input } = await mount({ initial: 5 });

		await focus(input);
		await type(input, "42");
		await press(input, "Escape");

		expect(input.value).toBe("5");
	});

	test("输入框上方向键按 step 增减", async () => {
		const { input } = await mount({ initial: 6, step: 3 });

		await focus(input);
		await press(input, "ArrowUp");
		expect(input.value).toBe("9");

		await press(input, "ArrowDown");
		expect(input.value).toBe("6");
	});

	test("按住加号连续变化，松手就停", async () => {
		vi.useFakeTimers();
		const { input, plus } = await mount({ initial: 0 });

		await act(async () => {
			plus.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		});
		expect(input.value).toBe("0");

		// 450ms 后开始连发，每 90ms 一步。
		await act(async () => {
			vi.advanceTimersByTime(450);
		});
		expect(input.value).toBe("1");

		await act(async () => {
			vi.advanceTimersByTime(180);
		});
		expect(input.value).toBe("3");

		await act(async () => {
			plus.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
		});
		await act(async () => {
			vi.advanceTimersByTime(1000);
		});
		expect(input.value).toBe("3");
	});

	test("按住收尾时那一次 click 不重复计数", async () => {
		vi.useFakeTimers();
		const { input, plus } = await mount({ initial: 0 });

		await act(async () => {
			plus.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
		});
		await act(async () => {
			vi.advanceTimersByTime(450);
		});
		await act(async () => {
			plus.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
			plus.click();
		});

		expect(input.value).toBe("1");
	});

	test("disabled 时不响应点击，也不启动连续变化", async () => {
		const { input, plus } = await mount({ initial: 2, disabled: true });

		await click(plus);
		expect(input.value).toBe("2");
	});
});
