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

	test("shape: pill by default, square on request", async () => {
		await mount(
			<>
				<ButtonGroup>
					<ButtonGroupItem title="a" />
				</ButtonGroup>
				<ButtonGroup shape="square">
					<ButtonGroupItem title="b" />
				</ButtonGroup>
			</>,
		);
		const groups = document.querySelectorAll("[data-slot=button-group]");
		const rim = groups[0]?.className ?? "";
		expect(rim).toContain("shadow-none");
		expect(rim).not.toContain("inset_0_1px_0_rgb(255_255_255/0.85)");
		expect(rim).toContain("dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.22)");
		expect(rim).toContain("0_8px_32px_rgb(0_0_0/0.18)");
		expect(rim).not.toContain("ring-foreground/10");
		expect(groups[0]?.className).toContain("rounded-full");
		expect(groups[1]?.className).toContain("rounded-xl");
		expect(groups[1]?.querySelector("button")?.className).toContain("rounded-[10px]");
	});

	test("variant: glass by default, flat drops the glass rim, ghost drops the container fill and dividers", async () => {
		await mount(
			<>
				<ButtonGroup>
					<ButtonGroupItem title="a" />
				</ButtonGroup>
				<ButtonGroup variant="flat">
					<ButtonGroupItem title="b" />
				</ButtonGroup>
				<ButtonGroup variant="ghost">
					<ButtonGroupItem title="c" active />
				</ButtonGroup>
			</>,
		);
		const [glass, flat, ghost] = Array.from(document.querySelectorAll<HTMLElement>("[data-slot=button-group]"));
		const rim = "dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.22)";

		expect(glass?.dataset.variant).toBe("glass");
		expect(glass?.className).toContain("bg-foreground/[0.06]");
		expect(glass?.className).toContain(rim);
		expect(glass?.className).toContain("backdrop-blur-md");

		// 扁平：深浅色都只留半透明底。
		expect(flat?.dataset.variant).toBe("flat");
		expect(flat?.className).toContain("bg-foreground/[0.06]");
		expect(flat?.className).toContain("dark:bg-white/[0.08]");
		expect(flat?.className).not.toContain(rim);
		expect(flat?.className).not.toContain("backdrop-blur");

		// 幽灵：容器没有底色、阴影和分隔线，选中项仍有自己的底色。
		expect(ghost?.dataset.variant).toBe("ghost");
		expect(ghost?.className).not.toContain("bg-foreground/[0.06]");
		expect(ghost?.className).not.toContain("dark:bg-white");
		expect(ghost?.className).not.toContain(rim);
		expect(ghost?.className).not.toContain("backdrop-blur");
		expect(ghost?.className).toContain("*:before:hidden");
		expect(ghost?.querySelector("button")?.className).toContain("data-[active]:bg-foreground/[0.1]");
	});

	test("divider pseudo-element is out of flow for every item, so an active first item cannot be pushed off-centre", async () => {
		await mount(
			<ButtonGroup>
				<ButtonGroupItem title="a" active />
			</ButtonGroup>,
		);
		const className = document.querySelector("button")?.className ?? "";
		// 每一项的 ::before 都是绝对定位；第一项隐藏。若只给非第一项绝对定位，
		// active 的 before:opacity-0 会让第一项生成一个在文档流里的 ::before，图标被 gap 推偏。
		expect(className).toContain("before:absolute");
		expect(className).not.toContain("not-first:before:absolute");
		expect(className).toContain("first:before:hidden");
	});
});
