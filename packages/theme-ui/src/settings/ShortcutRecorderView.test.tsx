// @vitest-environment jsdom

import { act, useState, type JSX } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ShortcutRecorderView, type ShortcutRecorderViewProps } from "./ShortcutRecorderView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
	for (const { root, container } of mounted.splice(0)) {
		act(() => root.unmount());
		container.remove();
	}
});

const eventToShortcut = (event: KeyboardEvent) => (event.key === "k" ? "mod+k" : null);

/** 受控录音器的宿主：把 onChange / onReset 落到可见状态上，断言用户看到的结果。 */
function RecorderHost({
	initialValue,
	initialIsDefault,
	onResetLabel,
}: {
	initialValue: string;
	initialIsDefault: boolean;
	onResetLabel: string;
}): JSX.Element {
	const [value, setValue] = useState(initialValue);
	const [isDefault, setIsDefault] = useState(initialIsDefault);
	const props: ShortcutRecorderViewProps = {
		value,
		isDefault,
		onChange: (next) => {
			setValue(next);
			setIsDefault(false);
		},
		onReset: () => {
			setValue(initialValue);
			setIsDefault(true);
		},
		placeholder: "Press shortcut",
		resetLabel: onResetLabel,
		eventToShortcut,
	};
	return <ShortcutRecorderView {...props} />;
}

function renderHost(initialValue = "mod+shift+k", initialIsDefault = true) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	mounted.push({ root, container });
	act(() => root.render(<RecorderHost initialValue={initialValue} initialIsDefault={initialIsDefault} onResetLabel="Reset binding" />));
	const button = container.querySelector("button");
	if (!button) throw new Error("recorder button missing");
	return { container, button: button as HTMLButtonElement };
}

describe("ShortcutRecorderView", () => {
	it("shows the bound shortcut as keycaps instead of a formatted string", () => {
		const { button } = renderHost();
		expect(button.querySelectorAll("kbd")).toHaveLength(3);
		expect(button.textContent).toContain("K");
		expect(button.textContent).not.toContain("mod+shift+k");
	});

	it("adopts the settings select trigger skin without a visible border", () => {
		const { button } = renderHost();
		// 与 SELECT_TRIGGER_CLASS 同皮：边框占位透明，底面 muted，悬停 accent。
		expect(button.className).toContain("border-transparent");
		expect(button.className).toContain("bg-muted");
		expect(button.className).toContain("hover:bg-accent");
		expect(button.className).not.toContain("border-input");
	});

	it("records the next key press and shows the new binding", () => {
		const { button } = renderHost();

		act(() => button.click());
		expect(button.textContent).toContain("Press shortcut");

		act(() => {
			document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
		});

		expect(button.textContent).not.toContain("Press shortcut");
		expect(button.querySelectorAll("kbd")).toHaveLength(2);
		expect(button.textContent).toContain("K");
	});

	it("offers reset only for customized bindings and clears it after reset", () => {
		const defaults = renderHost("mod+shift+k", true);
		expect(defaults.container.querySelectorAll("button")).toHaveLength(1);

		const customized = renderHost("mod+k", false);
		const buttons = [...customized.container.querySelectorAll("button")];
		expect(buttons).toHaveLength(2);
		const reset = buttons.find((el) => el !== customized.button);
		expect(reset?.title).toBe("Reset binding");

		act(() => reset?.click());
		expect(customized.container.querySelectorAll("button")).toHaveLength(1);
		expect(customized.button.textContent).toContain("K");
	});
});
