// @vitest-environment jsdom
import { useShortcutScope } from "@shared/shortcuts";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialogView, UpdateRestartDialogView } from "@vetta-org/theme-ui/overlays";
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from "@vetta-org/ui";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

function ConfirmationFixture({
	nested = false,
	onConfirm = vi.fn(),
}: {
	nested?: boolean;
	onConfirm?: (checked: boolean) => void;
}) {
	const [open, setOpen] = useState(false);
	const [checked, setChecked] = useState(false);
	const overlayRef = useRef<HTMLDivElement>(null);
	useShortcutScope({
		id: "modal:confirm-fixture",
		kind: "modal",
		active: open,
		exclusive: true,
		bindings: [{ key: "escape", run: () => setOpen(false) }],
	});
	const trigger = <Button onClick={() => setOpen(true)}>Remove project</Button>;
	return (
		<>
			{nested ? (
				<Dialog open>
					<DialogContent>
						<DialogTitle>Project settings</DialogTitle>
						<DialogDescription>Choose an action</DialogDescription>
						{trigger}
					</DialogContent>
				</Dialog>
			) : (
				trigger
			)}
			<ConfirmDialogView
				labels={{ cancel: "Cancel", confirm: "Remove" }}
				onCancel={() => setOpen(false)}
				onCheckboxCheckedChange={setChecked}
				onConfirm={() => {
					onConfirm(checked);
					setOpen(false);
				}}
				overlayRef={overlayRef}
				state={
					open
						? {
								title: "Remove this project?",
								message: "Project files will be kept.",
								variant: "danger",
								checkbox: { checked, label: "Remember my choice" },
							}
						: null
				}
			/>
		</>
	);
}

function RestartFixture({ onInstall }: { onInstall: () => void }) {
	const [visible, setVisible] = useState(false);
	const overlayRef = useRef<HTMLDivElement>(null);
	return (
		<>
			<Button onClick={() => setVisible(true)}>Review update</Button>
			<UpdateRestartDialogView
				labels={{
					title: "Update ready",
					message: "Restart to install the update.",
					later: "Later",
					install: "Restart",
				}}
				onClose={() => setVisible(false)}
				onInstall={() => {
					onInstall();
					setVisible(false);
				}}
				overlayRef={overlayRef}
				visible={visible}
			/>
		</>
	);
}

describe("global action dialogs", () => {
	it("names confirmation, starts with the safe action, traps focus, and restores it on Escape", async () => {
		const user = userEvent.setup();
		render(<ConfirmationFixture />);
		const trigger = screen.getByRole("button", { name: "Remove project" });
		await user.click(trigger);
		const dialog = screen.getByRole("alertdialog", { name: "Remove this project?" });
		expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
		await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })));
		await user.tab();
		expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Remove" }));
		await user.tab();
		expect(dialog.contains(document.activeElement)).toBe(true);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it("keeps the underlying dialog usable after cancelling, then confirms the current checkbox once", async () => {
		const user = userEvent.setup();
		const onConfirm = vi.fn();
		render(<ConfirmationFixture nested onConfirm={onConfirm} />);
		const trigger = screen.getByRole("button", { name: "Remove project" });
		await user.click(trigger);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		expect(screen.getByRole("dialog", { name: "Project settings" })).toBeTruthy();
		expect(onConfirm).not.toHaveBeenCalled();
		await user.click(trigger);
		await user.click(screen.getByRole("checkbox", { name: "Remember my choice" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(onConfirm).toHaveBeenCalledExactlyOnceWith(true);
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
	});

	it("lets users postpone an update with Escape and installs only after the explicit action", async () => {
		const user = userEvent.setup();
		const onInstall = vi.fn();
		render(<RestartFixture onInstall={onInstall} />);
		const trigger = screen.getByRole("button", { name: "Review update" });
		await user.click(trigger);
		const dialog = screen.getByRole("dialog", { name: "Update ready" });
		await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Later" })));
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(onInstall).not.toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(trigger));
		await user.click(trigger);
		await user.click(screen.getByRole("button", { name: "Restart" }));
		expect(onInstall).toHaveBeenCalledOnce();
	});
});
