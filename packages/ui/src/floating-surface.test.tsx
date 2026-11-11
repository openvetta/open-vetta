// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { FLOATING_SURFACE_CLASS } from "./utils";

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

/** 下拉 / 弹出面板共用同一套外观：大圆角、无边框、共用投影。调用方不应再覆盖。 */
describe("floating surface", () => {
	test("exposes the shared look as one constant", () => {
		expect(FLOATING_SURFACE_CLASS).toContain("rounded-2xl");
		expect(FLOATING_SURFACE_CLASS).toContain("shadow-[");
		expect(FLOATING_SURFACE_CLASS).not.toMatch(/\bborder\b/);
	});

	test("PopoverContent uses it without a border", async () => {
		await mount(
			<Popover open>
				<PopoverTrigger>open</PopoverTrigger>
				<PopoverContent>body</PopoverContent>
			</Popover>,
		);
		const el = document.querySelector("[data-slot=popover-content]");
		expect(el?.className).toContain("rounded-2xl");
		expect(el?.className).not.toMatch(/\bborder\b/);
	});

	test("DropdownMenuContent uses it without a border", async () => {
		await mount(
			<DropdownMenu open>
				<DropdownMenuTrigger>open</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>item</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>,
		);
		const el = document.querySelector("[data-slot=dropdown-menu-content]");
		expect(el?.className).toContain("rounded-2xl");
		expect(el?.className).not.toMatch(/\bborder\b/);
	});
});
