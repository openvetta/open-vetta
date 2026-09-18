// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@vetta-org/ui", () => ({
	Button: ({ children, onClick }: { children?: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
	Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
	DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
	DialogFooter: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
}));

import { GrokSubscriptionDialog } from "./GrokSubscriptionDialog";

afterEach(() => {
	cleanup();
});

describe("GrokSubscriptionDialog", () => {
	it("shows the SuperGrok device code and copies it", async () => {
		const onCopyCode = vi.fn();
		const onOpenPage = vi.fn();
		render(
			<GrokSubscriptionDialog
				state={{ open: true, userCode: "ABCD-1234", url: "https://accounts.x.ai/oauth2/device", error: null }}
				onCancel={() => {}}
				onOpenPage={onOpenPage}
				onCopyCode={onCopyCode}
			/>,
		);
		expect(screen.getByText("ABCD-1234")).toBeTruthy();
		await userEvent.click(screen.getByRole("button", { name: "grokSubscriptionCopyCode" }));
		expect(onCopyCode).toHaveBeenCalledOnce();
		await userEvent.click(screen.getByRole("button", { name: "grokSubscriptionOpenPage" }));
		expect(onOpenPage).toHaveBeenCalledOnce();
	});

	it("cancels while waiting for the device code", async () => {
		const onCancel = vi.fn();
		render(
			<GrokSubscriptionDialog
				state={{ open: true, userCode: "", url: "", error: null }}
				onCancel={onCancel}
				onOpenPage={() => {}}
				onCopyCode={() => {}}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: "grokSubscriptionCancel" }));
		expect(onCancel).toHaveBeenCalledOnce();
	});
});
