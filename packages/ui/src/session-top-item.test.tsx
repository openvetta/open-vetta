// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ButtonGroup } from "./button-group";
import { SessionTopGroup, SessionTopItem } from "./session-top-item";

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

describe("SessionTopItem", () => {
	test("standalone: wraps itself in a single-button group", async () => {
		const onClick = vi.fn();
		await mount(<SessionTopItem title="run" onClick={onClick} />);
		expect(document.querySelectorAll("[data-slot=button-group]")).toHaveLength(1);
		await act(async () => document.querySelector<HTMLButtonElement>("[data-slot=button-group-item]")?.click());
		expect(onClick).toHaveBeenCalledOnce();
	});

	test("inside a group: does not add a second capsule", async () => {
		await mount(
			<SessionTopGroup>
				<SessionTopItem title="a" />
				<SessionTopItem title="b" />
			</SessionTopGroup>,
		);
		expect(document.querySelectorAll("[data-slot=button-group]")).toHaveLength(1);
		expect(document.querySelectorAll("[data-slot=button-group-item]")).toHaveLength(2);
	});

	test("also fine inside a plain ButtonGroup", async () => {
		await mount(
			<ButtonGroup>
				<SessionTopItem title="a" />
			</ButtonGroup>,
		);
		expect(document.querySelectorAll("[data-slot=button-group]")).toHaveLength(1);
	});

	test("popover mode: renders custom content with a close handle", async () => {
		const onOpenChange = vi.fn();
		await mount(
			<SessionTopItem
				title="more"
				open
				onOpenChange={onOpenChange}
				popoverContent={({ close }) => (
					<button type="button" data-testid="inner" onClick={close}>
						inner
					</button>
				)}
			/>,
		);
		const inner = document.querySelector<HTMLButtonElement>("[data-testid=inner]");
		expect(inner).not.toBeNull();
		expect(document.querySelector("[data-slot=popover-content]")?.className).toContain("w-max");
		await act(async () => inner?.click());
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	test("shape square applies to the standalone capsule", async () => {
		await mount(<SessionTopItem title="a" shape="square" />);
		expect(document.querySelector("[data-slot=button-group]")?.className).toContain("rounded-xl");
	});
});
