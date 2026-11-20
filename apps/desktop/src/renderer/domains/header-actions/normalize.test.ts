import { describe, expect, it } from "vitest";
import { HEADER_ACTION_LIMITS, headerActionSignature, normalizeHeaderAction } from "./normalize";

const icon = "icon";

describe("normalizeHeaderAction", () => {
	it("null means not applicable, without a problem", () => {
		expect(normalizeHeaderAction(null)).toEqual({ value: null });
	});

	it("requires a title, an icon and exactly some behaviour", () => {
		expect(normalizeHeaderAction({ icon, onClick: () => {} }).problem).toMatch(/title/);
		expect(normalizeHeaderAction({ title: "t", onClick: () => {} }).problem).toMatch(/icon/);
		expect(normalizeHeaderAction({ title: "t", icon }).problem).toMatch(/onClick/);
	});

	it("prefers menuItems over popover over onClick", () => {
		const onSelect = () => {};
		const menu = normalizeHeaderAction({
			title: "t",
			icon,
			onClick: () => {},
			popover: () => null,
			menuItems: [{ id: "a", label: "A", onSelect }],
		});
		expect(menu.value?.behavior.type).toBe("menu");
		const popover = normalizeHeaderAction({ title: "t", icon, onClick: () => {}, popover: () => null });
		expect(popover.value?.behavior.type).toBe("popover");
		expect(normalizeHeaderAction({ title: "t", icon, onClick: () => {} }).value?.behavior.type).toBe("click");
	});

	it("clips the title and caps the menu", () => {
		const long = "x".repeat(100);
		const items = Array.from({ length: 30 }, (_, index) => ({ id: `i${index}`, label: long, onSelect: () => {} }));
		const { value } = normalizeHeaderAction({ title: long, icon, menuItems: items });
		expect(value?.title).toHaveLength(HEADER_ACTION_LIMITS.title);
		expect(value?.behavior.type === "menu" && value.behavior.items).toHaveLength(HEADER_ACTION_LIMITS.menuItems);
	});

	it("drops malformed and duplicate menu items; an empty menu falls through to the next behaviour", () => {
		const onSelect = () => {};
		const { value } = normalizeHeaderAction({
			title: "t",
			icon,
			onClick: () => {},
			menuItems: [{ id: "a", label: "", onSelect }, { id: "b", label: "B" }, null],
		});
		expect(value?.behavior.type).toBe("click");
	});

	it("accepts only positive numbers or true as a badge", () => {
		const base = { title: "t", icon, onClick: () => {} };
		expect(normalizeHeaderAction({ ...base, badge: 3 }).value?.badge).toBe(3);
		expect(normalizeHeaderAction({ ...base, badge: true }).value?.badge).toBe(true);
		expect(normalizeHeaderAction({ ...base, badge: 0 }).value?.badge).toBeUndefined();
		expect(normalizeHeaderAction({ ...base, badge: "9" }).value?.badge).toBeUndefined();
		expect(normalizeHeaderAction({ ...base, badge: Number.NaN }).value?.badge).toBeUndefined();
	});
});

describe("headerActionSignature", () => {
	const ids = (component: object) => (component as { id?: number }).id ?? 0;
	const base = () => ({ title: "t", icon: { type: "span", props: { className: "a" } }, onClick: () => {} });
	const sig = (raw: object) => {
		const { value } = normalizeHeaderAction(raw);
		if (!value) throw new Error("invalid");
		return headerActionSignature(value, ids);
	};

	it("is stable across re-renders that only produce new callbacks and element objects", () => {
		expect(sig(base())).toBe(sig(base()));
	});

	it("changes when something visible changes", () => {
		const original = sig(base());
		expect(sig({ ...base(), title: "u" })).not.toBe(original);
		expect(sig({ ...base(), badge: 2 })).not.toBe(original);
		expect(sig({ ...base(), active: true })).not.toBe(original);
		expect(sig({ ...base(), disabled: true })).not.toBe(original);
		expect(sig({ ...base(), icon: { type: "span", props: { className: "b" } } })).not.toBe(original);
	});

	it("tracks menu labels and disabled flags but not the select callbacks", () => {
		const menu = (disabled: boolean) => ({
			...base(),
			onClick: undefined,
			menuItems: [{ id: "a", label: "A", disabled, onSelect: () => {} }],
		});
		expect(sig(menu(false))).toBe(sig(menu(false)));
		expect(sig(menu(false))).not.toBe(sig(menu(true)));
	});
});

describe("2.11.0 declarations", () => {
	const base = { title: "t", icon, onClick: () => {} };

	it("clips the label and drops a blank one", () => {
		const { value } = normalizeHeaderAction({ ...base, label: "x".repeat(60) });
		expect(value?.label).toHaveLength(HEADER_ACTION_LIMITS.label);
		expect(normalizeHeaderAction({ ...base, label: "   " }).value?.label).toBeUndefined();
	});

	it("accepts only known tones", () => {
		expect(normalizeHeaderAction({ ...base, tone: "danger" }).value?.tone).toBe("danger");
		// neutral 就是默认外观，不必写进声明里。
		expect(normalizeHeaderAction({ ...base, tone: "neutral" }).value?.tone).toBeUndefined();
		expect(normalizeHeaderAction({ ...base, tone: "loud" }).value?.tone).toBeUndefined();
	});

	it("keeps a disabled reason only when the action is actually disabled", () => {
		expect(
			normalizeHeaderAction({ ...base, disabled: true, disabledReason: "merge in progress" }).value?.disabledReason,
		).toBe("merge in progress");
		expect(normalizeHeaderAction({ ...base, disabledReason: "nope" }).value?.disabledReason).toBeUndefined();
	});

	it("accepts structured menu items without onSelect for decorative kinds", () => {
		const { value } = normalizeHeaderAction({
			title: "t",
			icon,
			menuItems: [
				{ id: "h", kind: "label", label: "Branches" },
				{ id: "l", kind: "loading", label: "Loading" },
				{ id: "e", kind: "empty", label: "Nothing here" },
				{ id: "a", kind: "radio", label: "main", checked: true, onSelect: () => {} },
			],
		});
		const items = value?.behavior.type === "menu" ? value.behavior.items : [];
		expect(items.map((item) => item.kind)).toEqual(["label", "loading", "empty", "radio"]);
		expect(items[1]?.disabled).toBe(true);
		expect(items[3]?.checked).toBe(true);
	});

	it("drops interactive items that cannot fire, and submenus without children", () => {
		const { value } = normalizeHeaderAction({
			title: "t",
			icon,
			menuItems: [
				{ id: "a", label: "no handler" },
				{ id: "b", kind: "submenu", label: "empty submenu" },
				{
					id: "c",
					kind: "submenu",
					label: "Branches",
					children: [{ id: "c1", label: "main", onSelect: () => {} }],
				},
			],
		});
		const items = value?.behavior.type === "menu" ? value.behavior.items : [];
		expect(items.map((item) => item.id)).toEqual(["c"]);
		expect(items[0]?.children?.map((child) => child.id)).toEqual(["c1"]);
	});

	it("supports only one submenu level", () => {
		const { value } = normalizeHeaderAction({
			title: "t",
			icon,
			onClick: () => {},
			menuItems: [
				{
					id: "a",
					kind: "submenu",
					label: "A",
					children: [
						{ id: "b", kind: "submenu", label: "B", children: [{ id: "c", label: "C", onSelect: () => {} }] },
					],
				},
			],
		});
		// 第二层子菜单超出深度上限被丢弃，于是外层也空了、跟着消失；整个菜单退回到 onClick。
		expect(value?.behavior.type).toBe("click");
	});

	it("normalizes the object form of a popover, and rejects one without a component", () => {
		const Component = () => null;
		const { value } = normalizeHeaderAction({
			title: "t",
			icon,
			popover: { component: Component, size: "lg", host: "dialog", title: "Commit" },
		});
		expect(value?.behavior).toMatchObject({
			type: "popover",
			popover: { component: Component, size: "lg", host: "dialog", dialogTitle: "Commit" },
		});
		const fallback = normalizeHeaderAction({ title: "t", icon, onClick: () => {}, popover: { size: "lg" } });
		expect(fallback.value?.behavior.type).toBe("click");
	});

	it("keeps promoteWhenActive", () => {
		expect(normalizeHeaderAction({ ...base, promoteWhenActive: true }).value?.promoteWhenActive).toBe(true);
		expect(normalizeHeaderAction(base).value?.promoteWhenActive).toBe(false);
	});
});
