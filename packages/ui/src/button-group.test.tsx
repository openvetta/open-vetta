// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ButtonGroup, ButtonGroupItem } from "./button-group";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	document.body.replaceChildren();
});

async function mount(node: React.ReactNode): Promise<void> {
	const app = document.createElement("div");
	document.body.append(app);
	await act(async () => {
		createRoot(app).render(node);
	});
}

describe("ButtonGroup", () => {
	test("renders a group of buttons with label and click handling", async () => {
		const onClick = vi.fn();
		await mount(
			<ButtonGroup>
				<ButtonGroupItem icon={<i />} title="run" onClick={onClick} />
				<ButtonGroupItem icon={<i />} label="Commit" />
			</ButtonGroup>,
		);
		expect(document.querySelector("[role=group]")).not.toBeNull();
		const items = document.querySelectorAll<HTMLButtonElement>("[data-slot=button-group-item]");
		expect(items).toHaveLength(2);
		expect(items[1]?.textContent).toBe("Commit");
		await act(async () => items[0]?.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	test("badge: number is capped, true is a dot, zero is hidden", async () => {
		await mount(
			<ButtonGroup>
				<ButtonGroupItem title="a" badge={120} />
				<ButtonGroupItem title="b" badge />
				<ButtonGroupItem title="c" badge={0} />
			</ButtonGroup>,
		);
		const items = document.querySelectorAll("[data-slot=button-group-item]");
		expect(items[0]?.querySelector("[data-slot=button-group-badge]")?.textContent).toBe("99+");
		expect(items[1]?.querySelector("[data-slot=button-group-badge]")?.textContent).toBe("");
		expect(items[2]?.querySelector("[data-slot=button-group-badge]")).toBeNull();
	});

	test("active item exposes pressed state", async () => {
		await mount(
			<ButtonGroup>
				<ButtonGroupItem title="a" active />
			</ButtonGroup>,
		);
		const el = document.querySelector("[data-slot=button-group-item]");
		expect(el?.getAttribute("aria-pressed")).toBe("true");
		expect(el?.hasAttribute("data-active")).toBe(true);
	});
});
