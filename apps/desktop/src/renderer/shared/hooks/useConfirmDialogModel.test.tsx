// @vitest-environment jsdom

import { confirmDialogAtom } from "@shared/store/atoms";
import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useConfirmDialogModel } from "./useConfirmDialogModel.js";

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}));

vi.mock("@shared/shortcuts", () => ({
	useShortcutScope: () => undefined,
}));

describe("useConfirmDialogModel", () => {
	it("keeps a replacement dialog when the secondary action opens another confirm", () => {
		const store = createStore();
		store.set(confirmDialogAtom, {
			title: "first",
			message: "choose",
			secondaryLabel: "next",
			onConfirm: () => undefined,
			onSecondary: () => {
				store.set(confirmDialogAtom, {
					title: "second",
					message: "continue",
					onConfirm: () => undefined,
				});
			},
		});

		const { result } = renderHook(() => useConfirmDialogModel(), {
			wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
		});

		act(() => result.current.onSecondary?.());

		expect(store.get(confirmDialogAtom)?.title).toBe("second");
		expect(result.current.state?.title).toBe("second");
	});

	it("closes the dialog when the secondary action does not replace it", () => {
		const store = createStore();
		store.set(confirmDialogAtom, {
			title: "only",
			message: "choose",
			secondaryLabel: "done",
			onConfirm: () => undefined,
			onSecondary: () => undefined,
		});

		const { result } = renderHook(() => useConfirmDialogModel(), {
			wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
		});

		act(() => result.current.onSecondary?.());

		expect(store.get(confirmDialogAtom)).toBeNull();
		expect(result.current.state).toBeNull();
	});
});
